<?php
declare(strict_types=1);

/**
 * StoreHub -> inventory / menu sync
 *
 * POST JSON: { "date": "YYYY-MM-DD" }
 *
 * - Credentials stay on the server (config/storehub.php).
 * - Each product in a transaction is looked up with /products/{productId}
 *   and classified as Kitchen, Promo or Bar:
 *       Kitchen or Promo  -> saved in the `menu` table
 *       anything else     -> Bar, saved in the `inventory` table
 * - STRICT DATE MATCH: only transactions whose transactionTime falls on the
 *   sync date (same year, month and day, read in TRANSACTION_TIMEZONE) are saved.
 * - inventory: one row per SKU per day. menu: one row per product (name, category,
 *   selling price), updated on every sync. Re-running a sync never duplicates rows.
 *
 * Requires once:
 *   Run backend/inventory/storehub_usage_migrate.sql to create the idempotency ledger.
 *   Run backend/inventory/storehub_sync_runs_migrate.sql to track completed dates.
 *
 *   Run backend/inventory/menu_sync_migrate.sql once to add the StoreHub
 *   product id and its unique key to an existing menu table.
 *
 * config/storehub.php must return:
 *   base_url, username, password
 *   and optionally: db_host, db_name, db_user, db_pass
 */

header('Content-Type: application/json');

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'POST'], true)) {
    http_response_code(405);
    header('Allow: GET, POST');
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

// TODO: same session/auth check as inventory.php, e.g.
// session_start();
// if (empty($_SESSION['user'])) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'Unauthorized.']); exit; }

$config = require __DIR__ . '/../config/storehub.php';

const BUSINESS_TIMEZONE    = 'Asia/Manila';
const TRANSACTION_TIMEZONE = 'UTC'; // compare the date exactly as written in transactionTime
const DEFAULT_MIN_STOCK    = 5;

// Words (regex, case-insensitive) found in the product's category / tags.
// Edit these to match the categories you see in /products/{id}.
// Anything that matches neither list is treated as BAR.
const PROMO_PATTERN   = '/promo|bundle|set meal|combo/i';
const KITCHEN_PATTERN = '/kitchen|food|meal|appetizer|starter|main|rice|pasta|pizza|burger|sandwich|salad|soup|dessert|snack|side|breakfast/i';

/* -------------------------------------------------------------------------- */
/*  Classify a StoreHub product: 'Promo' | 'Kitchen' | 'Bar'                   */
/* -------------------------------------------------------------------------- */
function classifyProduct(array $product): string
{
    $tags = array_map(
        static fn($t) => is_array($t) ? (string) ($t['name'] ?? '') : (string) $t,
        (array) ($product['tags'] ?? [])
    );
    $text = trim(
        (string) ($product['category'] ?? '') . ' ' .
        (string) ($product['categoryName'] ?? '') . ' ' .
        implode(' ', $tags)
    );

    if (preg_match(PROMO_PATTERN, $text))   return 'Promo';
    if (preg_match(KITCHEN_PATTERN, $text)) return 'Kitchen';
    return 'Bar';
}

/* -------------------------------------------------------------------------- */
/*  StoreHub HTTP helper (Basic auth)                                          */
/* -------------------------------------------------------------------------- */
function storehubGet(array $config, string $path, array $query = []): array
{
    $url = rtrim((string) $config['base_url'], '/') . $path . ($query ? '?' . http_build_query($query) : '');
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
        CURLOPT_USERPWD        => $config['username'] . ':' . $config['password'],
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 45,
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($body === false) throw new RuntimeException("StoreHub connection failed: $err");
    if ($code === 401 || $code === 403) throw new RuntimeException('StoreHub rejected the username/password.');
    if ($code === 429) throw new RuntimeException('StoreHub rate limit reached. Try again in a minute.');
    if ($code < 200 || $code >= 300) throw new RuntimeException("StoreHub returned HTTP $code for $path.");

    $data = json_decode($body, true);
    if (!is_array($data)) throw new RuntimeException('Invalid response from StoreHub.');
    return $data;
}

function storehubGetProducts(array $config, array $productIds, int $concurrency = 8): array
{
    $products = [];
    $baseUrl = rtrim((string) $config['base_url'], '/');
    $headers = ['Accept: application/json'];

    foreach (array_chunk($productIds, $concurrency) as $batch) {
        $multi = curl_multi_init();
        $handles = [];

        foreach ($batch as $productId) {
            $path = '/products/' . rawurlencode((string) $productId);
            $handle = curl_init($baseUrl . $path);
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
                CURLOPT_USERPWD        => $config['username'] . ':' . $config['password'],
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT        => 45,
            ]);
            curl_multi_add_handle($multi, $handle);
            $handles[(string) $productId] = [$handle, $path];
        }

        do {
            $multiStatus = curl_multi_exec($multi, $running);
            if ($multiStatus !== CURLM_OK) {
                throw new RuntimeException('StoreHub product request failed: ' . curl_multi_strerror($multiStatus));
            }
            if ($running > 0 && curl_multi_select($multi, 1.0) === -1) {
                usleep(10000);
            }
        } while ($running > 0);

        $responses = [];
        foreach ($handles as $productId => [$handle, $path]) {
            $responses[$productId] = [
                'body' => curl_multi_getcontent($handle),
                'code' => (int) curl_getinfo($handle, CURLINFO_HTTP_CODE),
                'error' => curl_error($handle),
                'path' => $path,
            ];
            curl_multi_remove_handle($multi, $handle);
            curl_close($handle);
        }
        curl_multi_close($multi);

        foreach ($responses as $productId => $response) {
            if ($response['body'] === false) {
                throw new RuntimeException("StoreHub connection failed for {$response['path']}: {$response['error']}");
            }
            if ($response['code'] === 401 || $response['code'] === 403) {
                throw new RuntimeException('StoreHub rejected the username/password.');
            }
            if ($response['code'] === 429) {
                throw new RuntimeException('StoreHub rate limit reached. Try again in a minute.');
            }
            if ($response['code'] < 200 || $response['code'] >= 300) {
                throw new RuntimeException("StoreHub returned HTTP {$response['code']} for {$response['path']}.");
            }

            $product = json_decode($response['body'], true);
            if (!is_array($product)) {
                throw new RuntimeException("Invalid StoreHub response for {$response['path']}.");
            }
            $products[$productId] = $product;
        }
    }

    return $products;
}

function parseLocalDate(string $value, DateTimeZone $tz): DateTimeImmutable
{
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $value, $tz);
    if (!$d || $d->format('Y-m-d') !== $value) {
        throw new InvalidArgumentException("Invalid date: $value");
    }
    return $d;
}

function unitInBase(string $unit): ?array
{
    $unit = strtolower(str_replace([' ', '.'], '', trim($unit)));
    $units = [
        'g' => ['mass', 1.0], 'gram' => ['mass', 1.0], 'grams' => ['mass', 1.0],
        'kg' => ['mass', 1000.0], 'kilogram' => ['mass', 1000.0], 'kilograms' => ['mass', 1000.0],
        'mg' => ['mass', 0.001], 'milligram' => ['mass', 0.001], 'milligrams' => ['mass', 0.001],
        'oz' => ['mass', 28.349523125], 'ounce' => ['mass', 28.349523125], 'ounces' => ['mass', 28.349523125],
        'lb' => ['mass', 453.59237], 'lbs' => ['mass', 453.59237], 'pound' => ['mass', 453.59237], 'pounds' => ['mass', 453.59237],
        'ml' => ['volume', 1.0], 'milliliter' => ['volume', 1.0], 'milliliters' => ['volume', 1.0],
        'l' => ['volume', 1000.0], 'liter' => ['volume', 1000.0], 'liters' => ['volume', 1000.0],
        'cl' => ['volume', 10.0], 'tsp' => ['volume', 4.92892159375], 'teaspoon' => ['volume', 4.92892159375],
        'teaspoons' => ['volume', 4.92892159375], 'tbsp' => ['volume', 14.78676478125],
        'tablespoon' => ['volume', 14.78676478125], 'tablespoons' => ['volume', 14.78676478125],
        'cup' => ['volume', 236.5882365], 'cups' => ['volume', 236.5882365],
        'pc' => ['count', 1.0], 'pcs' => ['count', 1.0], 'piece' => ['count', 1.0],
        'pieces' => ['count', 1.0], 'each' => ['count', 1.0], 'ea' => ['count', 1.0],
        'unit' => ['count', 1.0], 'units' => ['count', 1.0],
        'clove' => ['clove', 1.0], 'cloves' => ['clove', 1.0],
    ];

    if (!isset($units[$unit])) return null;
    return ['dimension' => $units[$unit][0], 'factor' => $units[$unit][1]];
}

function convertRecipeQuantity(float $quantity, string $recipeUnit, string $stockUnit): ?float
{
    $recipe = unitInBase($recipeUnit);
    $stock = unitInBase($stockUnit);
    if (!$recipe || !$stock || $recipe['dimension'] !== $stock['dimension']) return null;
    return $quantity * $recipe['factor'] / $stock['factor'];
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'POST';
    if ($method === 'GET') {
        $input = $_GET;
    } else {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $input = is_array($input) ? $input : [];
    }

    $tz    = new DateTimeZone(BUSINESS_TIMEZONE);
    $today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');

    $date = (string) ($input['date'] ?? $today);
    $syncDate = parseLocalDate($date, $tz);

    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'] ?? 'localhost', $config['db_name'] ?? 'inventory'),
        $config['db_user'] ?? 'DB_USER',
        $config['db_pass'] ?? 'DB_PASS',
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );

    if ($method === 'GET') {
        $stmt = $pdo->prepare(
            'SELECT synced_at FROM storehub_sync_runs WHERE sync_date = :date'
        );
        $stmt->execute([':date' => $date]);
        $syncedAt = $stmt->fetchColumn();
        echo json_encode([
            'success' => true,
            'data' => [
                'date' => $date,
                'synced' => $syncedAt !== false,
                'syncedAt' => $syncedAt !== false ? $syncedAt : null,
            ],
        ]);
        exit;
    }

    // StoreHub timestamps are UTC, so fetch one extra day on each side,
    // then keep ONLY transactions whose date equals the sync date.
    $response = storehubGet($config, '/transactions', [
        'from' => $syncDate->modify('-1 day')->format('Y-m-d'),
        'to'   => $syncDate->modify('+1 day')->format('Y-m-d'),
    ]);
    // Accept both a plain array and a wrapped { "transactions": [...] } response.
    $transactions = isset($response['transactions']) && is_array($response['transactions'])
        ? $response['transactions']
        : $response;

    $txTz    = new DateTimeZone(TRANSACTION_TIMEZONE);
    $skipped = 0;

    // $sold[productId] = ['qty', 'name', 'sku']
    $sold = [];
    foreach ($transactions as $tx) {
        if (!is_array($tx) || empty($tx['transactionTime']) || !empty($tx['isCancelled'])) continue;

        try {
            $transactionTime = new DateTimeImmutable((string) $tx['transactionTime']);
            $txDate = $transactionTime->setTimezone($txTz)->format('Y-m-d');
        } catch (Exception $e) {
            $skipped++;
            continue;
        }

        // Not the same year, month and day as the sync date: do not save.
        if ($txDate !== $date) {
            $skipped++;
            continue;
        }

        $sign = strcasecmp((string) ($tx['transactionType'] ?? ''), 'Return') === 0 ? -1 : 1;

        foreach ((array) ($tx['items'] ?? []) as $item) {
            $pid = $item['productId'] ?? null;
            if (!$pid) continue;
            $sold[$pid]['qty']  = ($sold[$pid]['qty'] ?? 0) + $sign * (float) ($item['quantity'] ?? 0);
            $sold[$pid]['sku']  = $sold[$pid]['sku'] ?? ($item['sku'] ?? '');

            $transactionName = trim((string) ($item['name'] ?? ''));
            $nameTime = $transactionTime->getTimestamp();
            if (
                $transactionName !== '' &&
                (!isset($sold[$pid]['name_time']) || $nameTime >= $sold[$pid]['name_time'])
            ) {
                $sold[$pid]['name'] = $transactionName;
                $sold[$pid]['name_time'] = $nameTime;
            }
        }
    }

    $prevEnding = $pdo->prepare(
        'SELECT ending FROM inventory
         WHERE sku = :sku AND inventory_date < :d
         ORDER BY inventory_date DESC LIMIT 1'
    );

    $upsert = $pdo->prepare(
        "INSERT INTO inventory
           (type, inventory_date, counted_by, department, item_description, quantity, unit,
            beginning, purchases, sold_used, ending, remarks, sku, min_stock, max_stock,
            cost_per_unit, supplier, last_restocked, created_at, updated_at)
         VALUES
           ('storehub', :d, 'StoreHub Sync', :dept, :name, :quantity, :unit,
            :beginning, 0, :sold, :ending, 'Synced from StoreHub', :sku, :min_stock, :max_stock,
            :cost, '', NULL, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
            department       = VALUES(department),
            item_description = VALUES(item_description),
            cost_per_unit    = VALUES(cost_per_unit),
            sold_used        = VALUES(sold_used),
            ending           = beginning + purchases - VALUES(sold_used),
            quantity         = beginning + purchases - VALUES(sold_used),
            updated_at       = NOW()"
    );

    $menuUpsert = $pdo->prepare(
        "INSERT INTO menu
           (menu_date, product_id, menu_name, category, selling_price, created_at, updated_at)
         VALUES
           (:d, :pid, :name, :category, :price, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
            menu_date     = VALUES(menu_date),
            menu_name     = VALUES(menu_name),
            category      = VALUES(category),
            selling_price = VALUES(selling_price),
            updated_at    = NOW()"
    );

    $synced     = 0; // bar rows saved in inventory
    $menuSynced = 0; // kitchen / promo rows saved in menu
    $ingredientsDeducted = 0;
    $unitWarnings = [];
    $byDept     = [];

    // Load unique product details concurrently before opening the database transaction.
    $productCache = storehubGetProducts($config, array_keys($sold));
    $pdo->beginTransaction();
    foreach ($sold as $pid => $row) {
        $product = $productCache[(string) $pid];
        if (!empty($product['isDeleted'])) continue;

        $class    = classifyProduct($product);
        $sku      = ($product['sku'] ?? '') ?: (($row['sku'] ?? '') ?: 'SH-' . $pid);
        $name     = trim((string) ($row['name'] ?? '')) ?: (string) ($product['name'] ?? 'Unnamed');
        $cost     = (float) ($product['cost'] ?? 0);
        $qtySold  = max(0.0, (float) $row['qty']);

        if ($class === 'Kitchen' || $class === 'Promo') {
            // Kitchen or promo item: goes to the menu
            $menuUpsert->execute([
                ':d'        => $date,
                ':pid'      => (string) $pid,
                ':name'     => $name,
                ':category' => $class, // Kitchen or Promo
                ':price'    => (float) ($product['unitPrice'] ?? $product['price'] ?? 0),
            ]);
            $menuSynced++;
        } else {
            // Bar item: goes to inventory
            $unit = (string) ($product['unit'] ?? 'pcs');

            $prevEnding->execute([':sku' => $sku, ':d' => $date]);
            $beginning = (float) ($prevEnding->fetchColumn() ?: 0);
            $ending    = $beginning - $qtySold;

            $upsert->execute([
                ':d'         => $date,
                ':dept'      => 'Bar Inventory',
                ':name'      => $name,
                ':quantity'  => $ending,
                ':unit'      => $unit,
                ':beginning' => $beginning,
                ':sold'      => $qtySold,
                ':ending'    => $ending,
                ':sku'       => $sku,
                ':min_stock' => DEFAULT_MIN_STOCK,
                ':max_stock' => max(50.0, $beginning),
                ':cost'      => $cost,
            ]);
            $synced++;
        }

        $byDept[$class] = ($byDept[$class] ?? 0) + 1;
    }

    $recipeRows = $pdo->query(
        'SELECT m.product_id, m.menu_name, mi.inventory_id, mi.quantity_used, mi.unit AS recipe_unit,
                i.item_description, i.unit AS stock_unit
         FROM menu_ingredients mi
         JOIN menu m ON m.menu_id = mi.menu_id
         JOIN inventory i ON i.inventory_id = mi.inventory_id
         WHERE m.product_id IS NOT NULL AND m.product_id <> \'\''
    )->fetchAll();

    $ingredientUsage = [];
    foreach ($recipeRows as $recipe) {
        $pid = (string) $recipe['product_id'];
        $quantitySold = max(0.0, (float) ($sold[$pid]['qty'] ?? 0));
        if ($quantitySold <= 0) continue;

        $perItem = convertRecipeQuantity(
            (float) $recipe['quantity_used'],
            (string) $recipe['recipe_unit'],
            (string) $recipe['stock_unit']
        );
        if ($perItem === null) {
            $unitWarnings[] = sprintf(
                '%s: %s (%s per item) cannot be converted to %s.',
                $recipe['menu_name'],
                $recipe['item_description'],
                $recipe['recipe_unit'],
                $recipe['stock_unit']
            );
            continue;
        }

        $inventoryId = (int) $recipe['inventory_id'];
        $ingredientUsage[$inventoryId] = ($ingredientUsage[$inventoryId] ?? 0.0) + $perItem * $quantitySold;
    }

    $previousIngredients = $pdo->prepare(
        'SELECT inventory_id FROM storehub_inventory_sync_usage WHERE sync_date = :sync_date'
    );
    $previousIngredients->execute([':sync_date' => $date]);
    foreach ($previousIngredients->fetchAll(PDO::FETCH_COLUMN) as $inventoryId) {
        $ingredientUsage[(int) $inventoryId] ??= 0.0;
    }

    $previousUsage = $pdo->prepare(
        'SELECT quantity_used FROM storehub_inventory_sync_usage
         WHERE sync_date = :sync_date AND inventory_id = :inventory_id'
    );
    $lockIngredient = $pdo->prepare(
        'SELECT ending, quantity FROM inventory WHERE inventory_id = :inventory_id FOR UPDATE'
    );
    $updateIngredient = $pdo->prepare(
        'UPDATE inventory
         SET ending = :ending, quantity = :quantity, sold_used = COALESCE(sold_used, 0) + :used,
             updated_at = NOW()
         WHERE inventory_id = :inventory_id'
    );
    $saveUsage = $pdo->prepare(
        'INSERT INTO storehub_inventory_sync_usage (sync_date, inventory_id, quantity_used)
         VALUES (:sync_date, :inventory_id, :quantity_used)
         ON DUPLICATE KEY UPDATE quantity_used = VALUES(quantity_used)'
    );

    foreach ($ingredientUsage as $inventoryId => $quantityUsed) {
        $quantityUsed = round($quantityUsed, 4);
        $previousUsage->execute([':sync_date' => $date, ':inventory_id' => $inventoryId]);
        $previousQuantity = (float) ($previousUsage->fetchColumn() ?: 0);
        $difference = round($quantityUsed - $previousQuantity, 4);

        $lockIngredient->execute([':inventory_id' => $inventoryId]);
        $ingredient = $lockIngredient->fetch();
        if (!$ingredient) {
            throw new RuntimeException("Recipe inventory item $inventoryId no longer exists.");
        }

        if ($difference !== 0.0) {
            $currentStock = (float) ($ingredient['ending'] ?? $ingredient['quantity'] ?? 0);
            $updatedStock = $currentStock - $difference;
            $updateIngredient->execute([
                ':ending' => $updatedStock,
                ':quantity' => $updatedStock,
                ':used' => $difference,
                ':inventory_id' => $inventoryId,
            ]);
        }

        $saveUsage->execute([
            ':sync_date' => $date,
            ':inventory_id' => $inventoryId,
            ':quantity_used' => $quantityUsed,
        ]);
        $ingredientsDeducted++;
    }

    $saveSyncRun = $pdo->prepare(
        'INSERT INTO storehub_sync_runs
            (sync_date, synced_at, bar_items, menu_items, ingredients_deducted)
         VALUES (:date, NOW(), :bar_items, :menu_items, :ingredients_deducted)
         ON DUPLICATE KEY UPDATE
            synced_at = VALUES(synced_at),
            bar_items = VALUES(bar_items),
            menu_items = VALUES(menu_items),
            ingredients_deducted = VALUES(ingredients_deducted)'
    );
    $saveSyncRun->execute([
        ':date' => $date,
        ':bar_items' => $synced,
        ':menu_items' => $menuSynced,
        ':ingredients_deducted' => $ingredientsDeducted,
    ]);
    $syncedAt = (new DateTimeImmutable('now', $tz))->format('Y-m-d H:i:s');

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'data'    => [
            'date'         => $date,
            'synced'       => $synced,     // bar items saved in inventory
            'menu'         => $menuSynced, // kitchen / promo items saved in menu
            'ingredientsDeducted' => $ingredientsDeducted,
            'unitWarnings' => $unitWarnings,
            'syncedAt' => $syncedAt,
            'skipped'      => $skipped,    // transactions on other dates, not saved
            'byDepartment' => $byDept,
        ],
    ]);
} catch (InvalidArgumentException $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('[storehub_sync] ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}