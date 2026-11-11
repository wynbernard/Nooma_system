<?php
declare(strict_types=1);

/**
 * Menu backend  ->  backend/menu/menu.php
 *
 * Tables: menu (menu_id, product_id, menu_name, category, selling_price, created_at, updated_at)
 *         menu_ingredients (menu_ingredient_id, menu_id, inventory_id, quantity_used, unit)
 * Each menu item also returns ingredientCount and recipeCost
 * (recipeCost = sum of quantity_used x the ingredient's cost_per_unit in inventory).
 * Rows are filled by storehub_sync.php (Kitchen / Promo products) and can also be managed here.
 *
 *   GET    menu.php                  list all menu items   (optional ?category=Kitchen|Promo, ?q=search)
 *   POST   menu.php                  add an item           { "name", "category", "price" }
 *   PATCH  menu.php                  update an item        { "id", "name"?, "category"?, "price"? }
 *   DELETE menu.php?id=12            delete an item        (or JSON body { "id": 12 })
 *
 * Every response is { success, data?, message? }.
 * config/storehub.php may define: db_host, db_name, db_user, db_pass
 */

header('Content-Type: application/json');

// TODO: same session/auth check as inventory.php, e.g.
// session_start();
// if (empty($_SESSION['user'])) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'Unauthorized.']); exit; }

const MENU_CATEGORIES = ['Kitchen', 'Promo'];

function respond(bool $success, $data = null, ?string $message = null, int $status = 200): void
{
    http_response_code($status);
    $payload = ['success' => $success];
    if ($data !== null) $payload['data'] = $data;
    if ($message !== null) $payload['message'] = $message;
    echo json_encode($payload);
    exit;
}

/** Shape expected by MenuPage.tsx */
function toMenuItem(array $row): array
{
    $category = (string) $row['category'];
    return [
        'id'          => (string) $row['menu_id'],
        'sku'         => '',
        'name'        => (string) $row['menu_name'],
        'department'  => $category . ' Inventory', // "Kitchen Inventory" | "Promo Inventory"
        'category'    => $category,
        'description' => '',
        'price'       => (float) $row['selling_price'],
        'cost'        => (float) ($row['recipe_cost'] ?? 0),
        'ingredientCount' => (int) ($row['ingredient_count'] ?? 0),
        'recipeCost'  => round((float) ($row['recipe_cost'] ?? 0), 2),
        'imageUrl'    => '',
        'available'   => true,
    ];
}

function normalizeCategory(string $value): string
{
    $value = ucfirst(strtolower(trim($value)));
    $value = preg_replace('/\s*inventory$/i', '', $value) ?? $value;
    $value = ucfirst(strtolower(trim($value)));
    if (!in_array($value, MENU_CATEGORIES, true)) {
        throw new InvalidArgumentException('Category must be Kitchen or Promo.');
    }
    return $value;
}

function validName(mixed $value): string
{
    $name = trim((string) $value);
    if ($name === '' || mb_strlen($name) > 255) {
        throw new InvalidArgumentException('Menu name is required (max 255 characters).');
    }
    return $name;
}

function validPrice(mixed $value): float
{
    if (!is_numeric($value) || (float) $value < 0) {
        throw new InvalidArgumentException('Selling price must be a number, 0 or more.');
    }
    return round((float) $value, 2);
}

try {
    $config = is_file(__DIR__ . '/../config/storehub.php') ? require __DIR__ . '/../config/storehub.php' : [];

    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'] ?? 'localhost', $config['db_name'] ?? 'pointly_pos'),
        $config['db_user'] ?? 'DB_USER',
        $config['db_pass'] ?? 'DB_PASS',
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );

    $method = $_SERVER['REQUEST_METHOD'];
    $input  = json_decode((string) file_get_contents('php://input'), true);
    $input  = is_array($input) ? $input : [];

    $fetchOne = static function (PDO $pdo, int $id): ?array {
        $stmt = $pdo->prepare('SELECT * FROM menu WHERE menu_id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    };

    /* ------------------------------------------------------------------ GET */
    if ($method === 'GET') {
        $where  = [];
        $params = [];

        if (!empty($_GET['category'])) {
            $where[] = 'm.category = :category';
            $params[':category'] = normalizeCategory((string) $_GET['category']);
        }
        if (!empty($_GET['q'])) {
            $where[] = 'm.menu_name LIKE :q';
            $params[':q'] = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $_GET['q'])) . '%';
        }

        $sql = 'SELECT m.*,
                       COUNT(mi.menu_ingredient_id) AS ingredient_count,
                       COALESCE(SUM(mi.quantity_used * i.cost_per_unit), 0) AS recipe_cost
                FROM menu m
                LEFT JOIN menu_ingredients mi ON mi.menu_id = m.menu_id
                LEFT JOIN inventory i ON i.inventory_id = mi.inventory_id'
             . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' GROUP BY m.menu_id ORDER BY m.category, m.menu_name';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        respond(true, array_map('toMenuItem', $stmt->fetchAll()));
    }

    /* ----------------------------------------------------------------- POST */
    if ($method === 'POST') {
        $name     = validName($input['name'] ?? '');
        $category = normalizeCategory((string) ($input['category'] ?? ''));
        $price    = validPrice($input['price'] ?? null);

        $stmt = $pdo->prepare(
            'INSERT INTO menu (product_id, menu_name, category, selling_price, created_at, updated_at)
             VALUES (:pid, :name, :category, :price, NOW(), NOW())'
        );
        $stmt->execute([
            ':pid'      => 'MANUAL-' . bin2hex(random_bytes(6)),
            ':name'     => $name,
            ':category' => $category,
            ':price'    => $price,
        ]);

        respond(true, toMenuItem($fetchOne($pdo, (int) $pdo->lastInsertId())), null, 201);
    }

    /* ---------------------------------------------------------------- PATCH */
    if ($method === 'PATCH') {
        $id = (int) ($input['id'] ?? 0);
        if ($id <= 0 || !$fetchOne($pdo, $id)) {
            respond(false, null, 'Menu item not found.', 404);
        }

        $sets   = [];
        $params = [':id' => $id];
        if (array_key_exists('name', $input)) {
            $sets[] = 'menu_name = :name';
            $params[':name'] = validName($input['name']);
        }
        if (array_key_exists('category', $input)) {
            $sets[] = 'category = :category';
            $params[':category'] = normalizeCategory((string) $input['category']);
        }
        if (array_key_exists('price', $input)) {
            $sets[] = 'selling_price = :price';
            $params[':price'] = validPrice($input['price']);
        }
        if (!$sets) {
            throw new InvalidArgumentException('Nothing to update.');
        }

        $stmt = $pdo->prepare('UPDATE menu SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE menu_id = :id');
        $stmt->execute($params);

        respond(true, toMenuItem($fetchOne($pdo, $id)));
    }

    /* --------------------------------------------------------------- DELETE */
    if ($method === 'DELETE') {
        $id = (int) ($_GET['id'] ?? $input['id'] ?? 0);
        if ($id <= 0 || !$fetchOne($pdo, $id)) {
            respond(false, null, 'Menu item not found.', 404);
        }

        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM menu_ingredients WHERE menu_id = :id')->execute([':id' => $id]);
        $pdo->prepare('DELETE FROM menu WHERE menu_id = :id')->execute([':id' => $id]);
        $pdo->commit();

        respond(true, ['id' => (string) $id]);
    }

    respond(false, null, 'Method not allowed.', 405);
} catch (InvalidArgumentException $e) {
    respond(false, null, $e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[menu] ' . $e->getMessage());
    respond(false, null, 'Unable to process the menu request.', 500);
}