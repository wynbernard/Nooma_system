<?php
declare(strict_types=1);

/**
 * Menu ingredients backend  ->  backend/menu/menu_ingredients.php
 *
 * Table: menu_ingredients (menu_ingredient_id, menu_id, inventory_id, quantity_used, unit)
 * Links each menu item to the inventory items it uses.
 *
 * Run once (stops the same ingredient being added twice to one menu item):
 *   ALTER TABLE menu_ingredients ADD UNIQUE KEY uq_menu_inventory (menu_id, inventory_id);
 *
 *   GET    ?menu_id=5      ingredients of a menu item
 *   GET    ?options=1      inventory items that can be picked as ingredients
 *   POST   { menuId, inventoryId, quantityUsed, unit }
 *   PATCH  { id, quantityUsed?, unit? }
 *   DELETE ?id=7
 *
 * Every response is { success, data?, message? }.
 */

header('Content-Type: application/json');

// TODO: same session/auth check as inventory.php

function respond(bool $success, $data = null, ?string $message = null, int $status = 200): void
{
    http_response_code($status);
    $payload = ['success' => $success];
    if ($data !== null) $payload['data'] = $data;
    if ($message !== null) $payload['message'] = $message;
    echo json_encode($payload);
    exit;
}

function toIngredient(array $row): array
{
    return [
        'id'           => (string) $row['menu_ingredient_id'],
        'menuId'       => (string) $row['menu_id'],
        'inventoryId'  => (string) $row['inventory_id'],
        'name'         => (string) ($row['item_description'] ?? 'Unknown item'),
        'department'   => (string) ($row['department'] ?? ''),
        'quantityUsed' => (float) $row['quantity_used'],
        'unit'         => (string) $row['unit'],
        'costPerUnit'  => (float) ($row['cost_per_unit'] ?? 0),
    ];
}

function validQuantity(mixed $value): float
{
    if (!is_numeric($value) || (float) $value <= 0) {
        throw new InvalidArgumentException('Quantity used must be greater than zero.');
    }
    return round((float) $value, 4);
}

function validUnit(mixed $value): string
{
    $unit = trim((string) $value);
    if ($unit === '' || mb_strlen($unit) > 20) {
        throw new InvalidArgumentException('Unit is required (max 20 characters).');
    }
    return $unit;
}

try {
    $config = is_file(__DIR__ . '/../config/storehub.php') ? require __DIR__ . '/../config/storehub.php' : [];

    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'] ?? 'localhost', $config['db_name'] ?? 'inventory'),
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

    $baseSelect =
        'SELECT mi.menu_ingredient_id, mi.menu_id, mi.inventory_id, mi.quantity_used, mi.unit,
                i.item_description, i.department, i.cost_per_unit
         FROM menu_ingredients mi
         LEFT JOIN inventory i ON i.inventory_id = mi.inventory_id';

    $fetchOne = static function (PDO $pdo, string $baseSelect, int $id): ?array {
        $stmt = $pdo->prepare($baseSelect . ' WHERE mi.menu_ingredient_id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    };

    /* ------------------------------------------------------------------ GET */
    if ($method === 'GET') {
        // Inventory items to choose from: the latest row of each item.
        if (!empty($_GET['options'])) {
            $rows = $pdo->query(
                "SELECT i.inventory_id, i.item_description, i.department, i.unit, i.cost_per_unit
                 FROM inventory i
                 WHERE i.inventory_id = (
                     SELECT i2.inventory_id FROM inventory i2
                     WHERE COALESCE(NULLIF(i2.sku, ''), i2.item_description) = COALESCE(NULLIF(i.sku, ''), i.item_description)
                     ORDER BY i2.inventory_date DESC, i2.inventory_id DESC
                     LIMIT 1
                 )
                 ORDER BY i.department, i.item_description"
            )->fetchAll();

            respond(true, array_map(static fn(array $r): array => [
                'inventoryId' => (string) $r['inventory_id'],
                'name'        => (string) $r['item_description'],
                'department'  => (string) $r['department'],
                'unit'        => (string) $r['unit'],
                'costPerUnit' => (float) $r['cost_per_unit'],
            ], $rows));
        }

        $menuId = (int) ($_GET['menu_id'] ?? 0);
        if ($menuId <= 0) {
            respond(false, null, 'menu_id is required.', 400);
        }

        $stmt = $pdo->prepare($baseSelect . ' WHERE mi.menu_id = :menu_id ORDER BY i.item_description');
        $stmt->execute([':menu_id' => $menuId]);
        respond(true, array_map('toIngredient', $stmt->fetchAll()));
    }

    /* ----------------------------------------------------------------- POST */
    if ($method === 'POST') {
        $menuId      = (int) ($input['menuId'] ?? 0);
        $inventoryId = (int) ($input['inventoryId'] ?? 0);
        $quantity    = validQuantity($input['quantityUsed'] ?? null);
        $unit        = validUnit($input['unit'] ?? '');

        $exists = $pdo->prepare('SELECT 1 FROM menu WHERE menu_id = :id');
        $exists->execute([':id' => $menuId]);
        if (!$exists->fetchColumn()) respond(false, null, 'Menu item not found.', 404);

        $exists = $pdo->prepare('SELECT 1 FROM inventory WHERE inventory_id = :id');
        $exists->execute([':id' => $inventoryId]);
        if (!$exists->fetchColumn()) respond(false, null, 'Inventory item not found.', 404);

        $dup = $pdo->prepare('SELECT 1 FROM menu_ingredients WHERE menu_id = :m AND inventory_id = :i');
        $dup->execute([':m' => $menuId, ':i' => $inventoryId]);
        if ($dup->fetchColumn()) respond(false, null, 'This ingredient is already in the recipe.', 409);

        $stmt = $pdo->prepare(
            'INSERT INTO menu_ingredients (menu_id, inventory_id, quantity_used, unit)
             VALUES (:m, :i, :q, :u)'
        );
        $stmt->execute([':m' => $menuId, ':i' => $inventoryId, ':q' => $quantity, ':u' => $unit]);

        respond(true, toIngredient($fetchOne($pdo, $baseSelect, (int) $pdo->lastInsertId())), null, 201);
    }

    /* ---------------------------------------------------------------- PATCH */
    if ($method === 'PATCH') {
        $id = (int) ($input['id'] ?? 0);
        if ($id <= 0 || !$fetchOne($pdo, $baseSelect, $id)) {
            respond(false, null, 'Ingredient not found.', 404);
        }

        $sets   = [];
        $params = [':id' => $id];
        if (array_key_exists('quantityUsed', $input)) {
            $sets[] = 'quantity_used = :q';
            $params[':q'] = validQuantity($input['quantityUsed']);
        }
        if (array_key_exists('unit', $input)) {
            $sets[] = 'unit = :u';
            $params[':u'] = validUnit($input['unit']);
        }
        if (!$sets) throw new InvalidArgumentException('Nothing to update.');

        $pdo->prepare('UPDATE menu_ingredients SET ' . implode(', ', $sets) . ' WHERE menu_ingredient_id = :id')
            ->execute($params);

        respond(true, toIngredient($fetchOne($pdo, $baseSelect, $id)));
    }

    /* --------------------------------------------------------------- DELETE */
    if ($method === 'DELETE') {
        $id = (int) ($_GET['id'] ?? $input['id'] ?? 0);
        if ($id <= 0 || !$fetchOne($pdo, $baseSelect, $id)) {
            respond(false, null, 'Ingredient not found.', 404);
        }

        $pdo->prepare('DELETE FROM menu_ingredients WHERE menu_ingredient_id = :id')->execute([':id' => $id]);
        respond(true, ['id' => (string) $id]);
    }

    respond(false, null, 'Method not allowed.', 405);
} catch (InvalidArgumentException $e) {
    respond(false, null, $e->getMessage(), 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('[menu_ingredients] ' . $e->getMessage());
    respond(false, null, 'Unable to process the ingredient request.', 500);
}