<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../database/conn.php';

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit();
}

function readJson(): array
{
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'A valid JSON request body is required.']);
    }

    return $data;
}

function mapInventoryRow(array $row): array
{
    $stock = (float)($row['ending'] ?? $row['quantity'] ?? 0);
    $minStock = (float)($row['min_stock'] ?? 5);

    return [
        'id' => $row['sku'] ?: 'INV-' . $row['inventory_id'],
        'name' => $row['item_description'],
        'category' => $row['department'] ?: $row['type'],
        'stock' => $stock,
        'minStock' => $minStock,
        'maxStock' => (float)($row['max_stock'] ?? 50),
        'unit' => $row['unit'],
        'costPerUnit' => (float)($row['cost_per_unit'] ?? 0),
        'supplier' => $row['supplier'] ?? '',
        'lastRestocked' => $row['last_restocked'] ?: $row['inventory_date'],
        'status' => $stock === 0 ? 'Out of Stock' : ($stock <= $minStock ? 'Low Stock' : 'In Stock'),
    ];
}

function findInventoryBySku(PDO $pdo, string $sku, bool $includeLegacyId = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT inventory_id, sku, type, inventory_date, department, item_description,
                quantity, unit, beginning, purchases, sold_used, ending, min_stock,
                max_stock, cost_per_unit, supplier, last_restocked
         FROM inventory WHERE sku = :sku LIMIT 1'
    );
    $stmt->execute(['sku' => $sku]);
    $row = $stmt->fetch();

    if (!$row && $includeLegacyId && preg_match('/^INV-(\d+)$/', $sku, $matches)) {
        $stmt = $pdo->prepare(
            'SELECT inventory_id, sku, type, inventory_date, department, item_description,
                    quantity, unit, beginning, purchases, sold_used, ending, min_stock,
                    max_stock, cost_per_unit, supplier, last_restocked
             FROM inventory
             WHERE inventory_id = :inventory_id AND (sku IS NULL OR sku = \'\')
             LIMIT 1'
        );
        $stmt->execute(['inventory_id' => $matches[1]]);
        $row = $stmt->fetch();
    }

    return $row ?: null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET') {
        $stmt = $pdo->query(
            'SELECT inventory_id, sku, type, inventory_date, department, item_description,
                    quantity, unit, beginning, purchases, sold_used, ending, min_stock,
                    max_stock, cost_per_unit, supplier, last_restocked
             FROM inventory ORDER BY updated_at DESC, inventory_id DESC'
        );
        $items = array_map('mapInventoryRow', $stmt->fetchAll());
        respond(200, ['success' => true, 'data' => $items]);
    }

    if ($method === 'POST') {
        $data = readJson();
        $sku = trim((string)($data['id'] ?? ''));
        $name = trim((string)($data['name'] ?? ''));
        $category = trim((string)($data['category'] ?? ''));
        $unit = trim((string)($data['unit'] ?? ''));
        $supplier = trim((string)($data['supplier'] ?? ''));
        $stock = filter_var($data['stock'] ?? null, FILTER_VALIDATE_FLOAT);
        $minStock = filter_var($data['minStock'] ?? null, FILTER_VALIDATE_FLOAT);
        $maxStock = filter_var($data['maxStock'] ?? null, FILTER_VALIDATE_FLOAT);
        $costPerUnit = filter_var($data['costPerUnit'] ?? null, FILTER_VALIDATE_FLOAT);
        $beginning = filter_var($data['beginning'] ?? $stock, FILTER_VALIDATE_FLOAT);
        $purchases = filter_var($data['purchases'] ?? 0, FILTER_VALIDATE_FLOAT);
        $soldUsed = filter_var($data['soldUsed'] ?? 0, FILTER_VALIDATE_FLOAT);
        $remarks = trim((string)($data['remarks'] ?? ''));

        if (
            $sku === '' || $name === '' || $category === '' || $unit === '' ||
            $stock === false || $stock < 0 ||
            $minStock === false || $minStock < 0 ||
            $maxStock === false || $maxStock <= 0 || $maxStock < $minStock ||
            $costPerUnit === false || $costPerUnit < 0 ||
            $beginning === false || $beginning < 0 ||
            $purchases === false || $purchases < 0 ||
            $soldUsed === false || $soldUsed < 0
        ) {
            respond(422, ['success' => false, 'message' => 'Please provide valid item details and stock thresholds.']);
        }

        if (findInventoryBySku($pdo, $sku)) {
            respond(409, ['success' => false, 'message' => 'That SKU already exists in inventory.']);
        }

        $today = date('Y-m-d');
        $stmt = $pdo->prepare(
            'INSERT INTO inventory
                (sku, type, inventory_date, counted_by, department, item_description, quantity,
                 unit, beginning, purchases, sold_used, ending, remarks, min_stock, max_stock,
                 cost_per_unit, supplier, last_restocked)
             VALUES
                (:sku, :type, :inventory_date, :counted_by, :department, :item_description, :quantity,
                 :unit, :beginning, :purchases, :sold_used, :ending, :remarks, :min_stock, :max_stock,
                 :cost_per_unit, :supplier, :last_restocked)'
        );
        $stmt->execute([
            'sku' => $sku,
            'type' => $category,
            'inventory_date' => $today,
            'counted_by' => $_SESSION['username'] ?? 'System',
            'department' => $category,
            'item_description' => $name,
            'quantity' => $stock,
            'unit' => $unit,
            'beginning' => $beginning,
            'purchases' => $purchases,
            'sold_used' => $soldUsed,
            'ending' => $stock,
            'remarks' => $remarks,
            'min_stock' => $minStock,
            'max_stock' => $maxStock,
            'cost_per_unit' => $costPerUnit,
            'supplier' => $supplier,
            'last_restocked' => $today,
        ]);

        $item = findInventoryBySku($pdo, $sku);
        respond(201, ['success' => true, 'data' => mapInventoryRow($item)]);
    }

    if ($method === 'PATCH') {
        $data = readJson();
        if (($data['action'] ?? '') === 'edit') {
            $sku = trim((string)($data['id'] ?? ''));
            $name = trim((string)($data['name'] ?? ''));
            $category = trim((string)($data['category'] ?? ''));
            $unit = trim((string)($data['unit'] ?? ''));
            $supplier = trim((string)($data['supplier'] ?? ''));
            $minStock = filter_var($data['minStock'] ?? null, FILTER_VALIDATE_FLOAT);
            $maxStock = filter_var($data['maxStock'] ?? null, FILTER_VALIDATE_FLOAT);
            $costPerUnit = filter_var($data['costPerUnit'] ?? null, FILTER_VALIDATE_FLOAT);

            if (
                $sku === '' || $name === '' || $category === '' || $unit === '' ||
                $minStock === false || $minStock < 0 ||
                $maxStock === false || $maxStock <= 0 || $maxStock < $minStock ||
                $costPerUnit === false || $costPerUnit < 0
            ) {
                respond(422, ['success' => false, 'message' => 'Please provide valid item details and stock thresholds.']);
            }

            $item = findInventoryBySku($pdo, $sku, true);
            if (!$item) {
                respond(404, ['success' => false, 'message' => 'Inventory item not found.']);
            }

            $update = $pdo->prepare(
                'UPDATE inventory
                 SET type = :type, department = :department, item_description = :name,
                     unit = :unit, min_stock = :min_stock, max_stock = :max_stock,
                     cost_per_unit = :cost_per_unit, supplier = :supplier
                 WHERE inventory_id = :inventory_id'
            );
            $update->execute([
                'type' => $category,
                'department' => $category,
                'name' => $name,
                'unit' => $unit,
                'min_stock' => $minStock,
                'max_stock' => $maxStock,
                'cost_per_unit' => $costPerUnit,
                'supplier' => $supplier,
                'inventory_id' => $item['inventory_id'],
            ]);

            $updatedItem = findInventoryBySku($pdo, $sku, true);
            respond(200, ['success' => true, 'data' => mapInventoryRow($updatedItem)]);
        }

        $sku = trim((string)($data['id'] ?? ''));
        $amount = filter_var($data['amount'] ?? null, FILTER_VALIDATE_FLOAT);
        $type = $data['type'] ?? '';
        $reason = trim((string)($data['reason'] ?? 'Stock adjustment'));
        $note = trim((string)($data['note'] ?? ''));

        if ($sku === '' || $amount === false || $amount <= 0 || !in_array($type, ['add', 'subtract'], true)) {
            respond(422, ['success' => false, 'message' => 'A valid SKU, adjustment type, and positive amount are required.']);
        }

        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            'SELECT inventory_id, sku, type, inventory_date, department, item_description,
                    quantity, unit, beginning, purchases, sold_used, ending, min_stock,
                    max_stock, cost_per_unit, supplier, last_restocked, remarks
             FROM inventory WHERE sku = :sku LIMIT 1 FOR UPDATE'
        );
        $stmt->execute(['sku' => $sku]);
        $row = $stmt->fetch();

        if (!$row && preg_match('/^INV-(\d+)$/', $sku, $legacyMatch)) {
            $stmt = $pdo->prepare(
                'SELECT inventory_id, sku, type, inventory_date, department, item_description,
                        quantity, unit, beginning, purchases, sold_used, ending, min_stock,
                        max_stock, cost_per_unit, supplier, last_restocked, remarks
                 FROM inventory
                 WHERE inventory_id = :inventory_id AND (sku IS NULL OR sku = \'\')
                 LIMIT 1 FOR UPDATE'
            );
            $stmt->execute(['inventory_id' => $legacyMatch[1]]);
            $row = $stmt->fetch();
        }

        if (!$row) {
            $pdo->rollBack();
            respond(404, ['success' => false, 'message' => 'Inventory item not found.']);
        }

        $currentStock = (float)($row['ending'] ?? $row['quantity'] ?? 0);
        $change = $type === 'add' ? $amount : -$amount;
        $updatedStock = max(0, $currentStock + $change);
        $actualChange = $updatedStock - $currentStock;
        $auditEntry = sprintf(
            '[%s] %s %s %s; %s',
            date('Y-m-d H:i:s'),
            $reason,
            $actualChange >= 0 ? '+' : '',
            rtrim(rtrim(number_format($actualChange, 2, '.', ''), '0'), '.'),
            $note
        );
        $remarks = trim((string)($row['remarks'] ?? ''));
        $remarks = $remarks === '' ? $auditEntry : $remarks . PHP_EOL . $auditEntry;

        $update = $pdo->prepare(
            'UPDATE inventory
             SET quantity = :quantity, ending = :ending,
                 purchases = COALESCE(purchases, 0) + :purchases,
                 sold_used = COALESCE(sold_used, 0) + :sold_used,
                 last_restocked = CASE WHEN :is_restock = 1 THEN CURDATE() ELSE last_restocked END,
                 remarks = :remarks
             WHERE inventory_id = :inventory_id'
        );
        $update->execute([
            'quantity' => $updatedStock,
            'ending' => $updatedStock,
            'purchases' => $type === 'add' ? $actualChange : 0,
            'sold_used' => $type === 'subtract' ? abs($actualChange) : 0,
            'is_restock' => $type === 'add' ? 1 : 0,
            'remarks' => $remarks,
            'inventory_id' => $row['inventory_id'],
        ]);
        $pdo->commit();

        $item = findInventoryBySku($pdo, $sku, true);
        respond(200, ['success' => true, 'data' => mapInventoryRow($item)]);
    }

    header('Allow: GET, POST, PATCH');
    respond(405, ['success' => false, 'message' => 'Method Not Allowed']);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    if (($e->errorInfo[1] ?? null) === 1062) {
        respond(409, ['success' => false, 'message' => 'That SKU already exists in inventory.']);
    }

    error_log('Inventory API database error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Unable to save or load inventory. Check the inventory database schema.']);
}
