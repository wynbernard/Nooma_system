<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (empty($_SESSION['user_id'])) {
    respond(401, ['success' => false, 'message' => 'Please sign in to view sales reports.']);
}

if (strtolower((string) ($_SESSION['role'] ?? '')) !== 'admin') {
    respond(403, ['success' => false, 'message' => 'Administrator access is required to view sales reports.']);
}

require_once __DIR__ . '/../database/conn.php';

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'POST') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond(400, ['success' => false, 'message' => 'A valid JSON request body is required.']);
        }

        $action = (string) ($input['action'] ?? '');
        if ($action === 'delete') {
            $reportId = filter_var($input['reportId'] ?? null, FILTER_VALIDATE_INT);
            if ($reportId === false || $reportId <= 0) {
                respond(422, ['success' => false, 'message' => 'A valid report ID is required.']);
            }

            $delete = $pdo->prepare('DELETE FROM daily_reports WHERE report_id = :report_id');
            $delete->execute(['report_id' => $reportId]);
            if ($delete->rowCount() === 0) {
                respond(404, ['success' => false, 'message' => 'Sales report not found.']);
            }

            respond(200, ['success' => true, 'message' => 'Sales report deleted successfully.']);
        }

        if (!in_array($action, ['add', 'update'], true)) {
            respond(400, ['success' => false, 'message' => 'Unsupported sales report action.']);
        }

        $reportId = null;
        if ($action === 'update') {
            $reportId = filter_var($input['reportId'] ?? null, FILTER_VALIDATE_INT);
            if ($reportId === false || $reportId <= 0) {
                respond(422, ['success' => false, 'message' => 'A valid report ID is required.']);
            }
        }

        $reportNumber = trim((string) ($input['reportNumber'] ?? ''));
        $reportDate = trim((string) ($input['reportDate'] ?? ''));
        $shiftName = trim((string) ($input['shiftName'] ?? ''));
        $cashierName = trim((string) ($input['cashierName'] ?? ''));
        $saleChannel = strtoupper(trim((string) ($input['saleChannel'] ?? '')));
        $status = strtolower(trim((string) ($input['status'] ?? 'draft')));
        $parseAmount = static function ($value) {
            if (!is_scalar($value)) {
                return false;
            }
            $value = trim((string) $value);
            return $value === '' ? 0.0 : filter_var($value, FILTER_VALIDATE_FLOAT);
        };
        $parseCount = static function ($value) {
            if (!is_scalar($value)) {
                return false;
            }
            $value = trim((string) $value);
            return $value === '' ? 0 : filter_var($value, FILTER_VALIDATE_INT);
        };
        $cashRemitted = $parseAmount($input['cashRemitted'] ?? 0);
        $serviceCharge = $parseAmount($input['serviceChargeTotal'] ?? 0);
        $totalTables = $parseCount($input['totalTables'] ?? 0);
        $totalPax = $parseCount($input['totalPax'] ?? 0);
        $declaredTotal = $parseAmount($input['telegramDeclaredTotal'] ?? 0);
        $ownerAccountsInput = $input['ownerAccounts'] ?? [];
        $unpaidAccountsInput = $input['unpaidAccounts'] ?? [];
        $otherPaymentsInput = $input['otherPayments'] ?? [];
        $deductionsInput = $input['deductions'] ?? [];
        $salesBreakdown = [];
        foreach ([
            'kitchenSales',
            'barSales',
            'corkage',
            'totalSaleKsBsCorkage',
            'grabSaleGross',
            'grabSaleLess27',
        ] as $salesField) {
            $amount = $parseAmount($input[$salesField] ?? 0);
            if ($amount === false || $amount < 0) {
                respond(422, ['success' => false, 'message' => 'Please provide valid sales amounts.']);
            }
            $salesBreakdown[$salesField] = (float) $amount;
        }
        $paymentFields = [];
        foreach ([
            'cashRemitted',
            'gcashQrph',
            'paymaya',
            'amex',
            'visa',
            'mastercard',
            'bancnet',
            'jcb',
            'bpiNooma',
            'eastwestNooma',
            'giftCheck',
            'chequePayment',
        ] as $paymentField) {
            $amount = $parseAmount($input[$paymentField] ?? 0);
            if ($amount === false || $amount < 0) {
                respond(422, ['success' => false, 'message' => 'Please provide valid payment amounts.']);
            }
            $paymentFields[$paymentField] = (float) $amount;
        }
        $validDate = DateTimeImmutable::createFromFormat('!Y-m-d', $reportDate);
        if ($reportNumber === '' && $action === 'add') {
            $reportNumberExists = $pdo->prepare(
                'SELECT 1 FROM daily_reports WHERE report_number = :report_number LIMIT 1'
            );
            for ($attempt = 0; $attempt < 10; $attempt++) {
                $candidate = 'SR-' . date('YmdHis') . '-' . random_int(100000, 999999);
                $reportNumberExists->execute(['report_number' => $candidate]);
                if (!$reportNumberExists->fetchColumn()) {
                    $reportNumber = $candidate;
                    break;
                }
            }
            if ($reportNumber === '') {
                respond(500, [
                    'success' => false,
                    'message' => 'Unable to generate a unique sales report number.',
                ]);
            }
        }

        if (
            $reportNumber === '' || strlen($reportNumber) > 50 ||
            !$validDate || $validDate->format('Y-m-d') !== $reportDate ||
            $shiftName === '' || strlen($shiftName) > 50 ||
            $cashierName === '' || !in_array($saleChannel, ['POS', 'NON POS'], true) ||
            !in_array($status, ['draft', 'submitted', 'approved', 'reopened', 'voided'], true) ||
            $cashRemitted === false || $cashRemitted < 0 ||
            $serviceCharge === false || $serviceCharge < 0 ||
            $totalTables === false || $totalTables < 0 ||
            $totalPax === false || $totalPax < 0 ||
            $declaredTotal === false || $declaredTotal < 0
        ) {
            respond(422, ['success' => false, 'message' => 'Please provide valid sales report details.']);
        }

        if (!is_array($ownerAccountsInput)) {
            respond(422, ['success' => false, 'message' => 'Owner account amounts must be an object.']);
        }
        if (!is_array($unpaidAccountsInput)) {
            respond(422, ['success' => false, 'message' => 'Unpaid accounts must be a list.']);
        }
        if (!is_array($otherPaymentsInput)) {
            respond(422, ['success' => false, 'message' => 'Other payment amounts must be an object.']);
        }
        if (!is_array($deductionsInput)) {
            respond(422, ['success' => false, 'message' => 'Sale deduction amounts must be an object.']);
        }

        $activeOwnerIds = $pdo->query(
            "SELECT account_holder_id
             FROM account_holders
             WHERE is_active = 1 AND account_type = 'owner'"
        )->fetchAll(PDO::FETCH_COLUMN);
        $activeOwnerIds = array_fill_keys(array_map('strval', $activeOwnerIds), true);
        $ownerAccounts = [];
        foreach ($ownerAccountsInput as $accountId => $amount) {
            $accountId = (string) $accountId;
            $validatedAmount = is_scalar($amount)
                ? (trim((string) $amount) === '' ? 0.0 : filter_var($amount, FILTER_VALIDATE_FLOAT))
                : false;
            if (
                !ctype_digit($accountId) ||
                !isset($activeOwnerIds[$accountId]) ||
                $validatedAmount === false ||
                $validatedAmount < 0
            ) {
                respond(422, ['success' => false, 'message' => 'Please provide valid amounts for active owner accounts.']);
            }
            $ownerAccounts[$accountId] = (float) $validatedAmount;
        }

        $unpaidAccounts = [];
        foreach ($unpaidAccountsInput as $unpaidAccount) {
            if (!is_array($unpaidAccount)) {
                respond(422, ['success' => false, 'message' => 'Please provide valid unpaid account details.']);
            }
            $accountName = trim((string) ($unpaidAccount['accountName'] ?? ''));
            $notesText = trim((string) ($unpaidAccount['notes'] ?? ''));
            $amountInput = $unpaidAccount['amount'] ?? 0;
            $amount = is_scalar($amountInput)
                ? (trim((string) $amountInput) === '' ? 0.0 : filter_var($amountInput, FILTER_VALIDATE_FLOAT))
                : false;
            if (
                strlen($accountName) > 100 ||
                strlen($notesText) > 255 ||
                $amount === false ||
                $amount < 0 ||
                (($amount > 0 || $notesText !== '') && $accountName === '')
            ) {
                respond(422, ['success' => false, 'message' => 'Please provide valid unpaid account details.']);
            }
            if ($accountName === '' && $amount === 0.0 && $notesText === '') {
                continue;
            }
            $unpaidAccounts[] = [
                'accountName' => $accountName,
                'amount' => (float) $amount,
                'notes' => $notesText,
            ];
        }

        $otherPayments = [];
        foreach ([
            'otherCash',
            'otherCardMayaTerminal',
            'otherDirectBpiNooma',
            'otherDirectEastwestNooma',
            'otherGiftCheck',
            'otherCheque',
        ] as $paymentField) {
            $amountInput = $otherPaymentsInput[$paymentField] ?? 0;
            $amount = is_scalar($amountInput)
                ? (trim((string) $amountInput) === '' ? 0.0 : filter_var($amountInput, FILTER_VALIDATE_FLOAT))
                : false;
            if ($amount === false || $amount < 0) {
                respond(422, ['success' => false, 'message' => 'Please provide valid amounts for other payments.']);
            }
            $otherPayments[$paymentField] = (float) $amount;
        }

        $deductions = [];
        foreach ([
            'pwdDiscount',
            'seniorCitizenDiscount',
            'specialCustomerDiscount',
        ] as $deductionField) {
            $amountInput = $deductionsInput[$deductionField] ?? 0;
            $amount = is_scalar($amountInput)
                ? (trim((string) $amountInput) === '' ? 0.0 : filter_var($amountInput, FILTER_VALIDATE_FLOAT))
                : false;
            if ($amount === false || $amount < 0) {
                respond(422, ['success' => false, 'message' => 'Please provide valid sale deduction amounts.']);
            }
            $deductions[$deductionField] = (float) $amount;
        }

        $paymentMethodNames = [
            'cashRemitted' => ['Cash', 'sales'],
            'gcashQrph' => ['GCash + QR PH', 'sales'],
            'paymaya' => ['PayMaya', 'sales'],
            'amex' => ['AMEX', 'sales'],
            'visa' => ['Visa', 'sales'],
            'mastercard' => ['Mastercard', 'sales'],
            'bancnet' => ['BancNet', 'sales'],
            'jcb' => ['JCB', 'sales'],
            'bpiNooma' => ['Direct BT BPI Nooma', 'sales'],
            'eastwestNooma' => ['Direct BT EastWest Nooma', 'sales'],
            'giftCheck' => ['Nooma Gift Check', 'sales'],
            'chequePayment' => ['Cheque Payment', 'sales'],
            'otherCash' => ['Other Cash', 'other_payment'],
            'otherCardMayaTerminal' => ['Card (Maya Terminal)', 'other_payment'],
            'otherDirectBpiNooma' => ['Direct BT BPI Nooma (Other)', 'other_payment'],
            'otherDirectEastwestNooma' => ['Direct BT EastWest Nooma (Other)', 'other_payment'],
            'otherGiftCheck' => ['Gift Check (Other)', 'other_payment'],
            'otherCheque' => ['Cheques (Other)', 'other_payment'],
        ];
        $paymentMethodIds = $pdo->query(
            'SELECT method_name, payment_method_id FROM payment_methods WHERE is_active = 1'
        )->fetchAll(PDO::FETCH_KEY_PAIR);
        $paymentRows = [];
        foreach ($paymentMethodNames as $field => [$methodName, $source]) {
            $amount = $paymentFields[$field] ?? $otherPayments[$field] ?? 0.0;
            if ($amount <= 0) {
                continue;
            }
            if (!isset($paymentMethodIds[$methodName])) {
                respond(500, [
                    'success' => false,
                    'message' => 'A configured payment method is missing: ' . $methodName,
                ]);
            }
            $paymentRows[] = [
                'payment_method_id' => (int) $paymentMethodIds[$methodName],
                'payment_source' => $source,
                'amount' => $amount,
            ];
        }

        $discountTypeNames = [
            'pwdDiscount' => 'PWD Discount',
            'seniorCitizenDiscount' => 'Senior Discount',
            'specialCustomerDiscount' => 'Special Customer Discount',
        ];
        $discountTypeIds = $pdo->query(
            'SELECT discount_name, discount_type_id FROM discount_types WHERE is_active = 1'
        )->fetchAll(PDO::FETCH_KEY_PAIR);
        $deductionRows = [];
        foreach ($discountTypeNames as $field => $discountName) {
            $amount = $deductions[$field];
            if ($amount <= 0) {
                continue;
            }
            if (!isset($discountTypeIds[$discountName])) {
                respond(500, [
                    'success' => false,
                    'message' => 'A configured discount type is missing: ' . $discountName,
                ]);
            }
            $deductionRows[] = [
                'discount_type_id' => (int) $discountTypeIds[$discountName],
                'amount' => $amount,
            ];
        }

        $totalPayments = array_sum($paymentFields)
            + array_sum($otherPayments)
            + array_sum($ownerAccounts)
            + array_sum(array_column($unpaidAccounts, 'amount'));
        $reconShortOver = (float) $declaredTotal - $totalPayments;

        $pdo->beginTransaction();
        $notes = [
            'cashierName' => $cashierName,
            'cashRemitted' => (float) $cashRemitted,
            'saleChannel' => $saleChannel,
            'ownerAccounts' => (object) $ownerAccounts,
            'unpaidAccounts' => $unpaidAccounts,
            'otherPayments' => (object) $otherPayments,
            'deductions' => (object) $deductions,
            'paymentFields' => (object) $paymentFields,
            'salesBreakdown' => (object) $salesBreakdown,
            'reconShortOver' => number_format($reconShortOver, 2, '.', ','),
        ];
        $posSalesTotal = $saleChannel === 'POS'
            ? $salesBreakdown['totalSaleKsBsCorkage']
            : 0.0;

        if ($action === 'add') {
            $insert = $pdo->prepare(
                'INSERT INTO daily_reports
                    (report_number, report_date, shift_name, week_number, cashier_id,
                     total_tables, total_pax, telegram_declared_total, pos_sales_total, status, notes)
                 VALUES
                    (:report_number, :report_date, :shift_name, :week_number, :cashier_id,
                     :total_tables, :total_pax, :telegram_declared_total, :pos_sales_total, :status, :notes)'
            );
            $insert->execute([
                'report_number' => $reportNumber,
                'report_date' => $reportDate,
                'shift_name' => $shiftName,
                'week_number' => (int) $validDate->format('W'),
                'cashier_id' => (int) $_SESSION['user_id'],
                'total_tables' => $totalTables,
                'total_pax' => $totalPax,
                'telegram_declared_total' => $declaredTotal,
                'pos_sales_total' => $posSalesTotal,
                'status' => $status,
                'notes' => json_encode($notes, JSON_THROW_ON_ERROR),
            ]);
            $reportId = (int) $pdo->lastInsertId();
        } else {
            $existing = $pdo->prepare('SELECT report_id FROM daily_reports WHERE report_id = :report_id FOR UPDATE');
            $existing->execute(['report_id' => $reportId]);
            if (!$existing->fetchColumn()) {
                $pdo->rollBack();
                respond(404, ['success' => false, 'message' => 'Sales report not found.']);
            }

            $update = $pdo->prepare(
                'UPDATE daily_reports
                 SET report_number = :report_number,
                     report_date = :report_date,
                     shift_name = :shift_name,
                     week_number = :week_number,
                     total_tables = :total_tables,
                     total_pax = :total_pax,
                     telegram_declared_total = :telegram_declared_total,
                     pos_sales_total = :pos_sales_total,
                     status = :status,
                     notes = :notes
                 WHERE report_id = :report_id'
            );
            $update->execute([
                'report_number' => $reportNumber,
                'report_date' => $reportDate,
                'shift_name' => $shiftName,
                'week_number' => (int) $validDate->format('W'),
                'total_tables' => $totalTables,
                'total_pax' => $totalPax,
                'telegram_declared_total' => $declaredTotal,
                'pos_sales_total' => $posSalesTotal,
                'status' => $status,
                'notes' => json_encode($notes, JSON_THROW_ON_ERROR),
                'report_id' => $reportId,
            ]);

            $deleteReportSales = $pdo->prepare(
                "DELETE FROM report_sales
                 WHERE report_id = :report_id
                   AND sales_type IN ('kitchen', 'bar', 'corkage', 'service_charge', 'grab_gross')"
            );
            $deleteReportSales->execute(['report_id' => $reportId]);

            $deleteReportPayments = $pdo->prepare(
                "DELETE FROM report_payments
                 WHERE report_id = :report_id
                   AND payment_source IN ('sales', 'other_payment')"
            );
            $deleteReportPayments->execute(['report_id' => $reportId]);

            $deleteOwnerAccounts = $pdo->prepare(
                "DELETE FROM report_accounts
                 WHERE report_id = :report_id
                   AND account_category = 'owners_account'"
            );
            $deleteOwnerAccounts->execute(['report_id' => $reportId]);

            $managedDiscountIds = [];
            foreach ($discountTypeNames as $discountName) {
                if (isset($discountTypeIds[$discountName])) {
                    $managedDiscountIds[] = (int) $discountTypeIds[$discountName];
                }
            }
            if ($managedDiscountIds !== []) {
                $placeholders = implode(',', array_fill(0, count($managedDiscountIds), '?'));
                $deleteDeductions = $pdo->prepare(
                    "DELETE FROM report_deductions
                     WHERE report_id = ?
                       AND deduction_type = 'discount'
                       AND discount_type_id IN ($placeholders)"
                );
                $deleteDeductions->execute(array_merge([$reportId], $managedDiscountIds));
            }
        }

        $reportSales = [
            'kitchen' => $salesBreakdown['kitchenSales'],
            'bar' => $salesBreakdown['barSales'],
            'corkage' => $salesBreakdown['corkage'],
            'service_charge' => (float) $serviceCharge,
            'grab_gross' => $salesBreakdown['grabSaleGross'],
        ];
        $insertReportSale = $pdo->prepare(
            'INSERT INTO report_sales (report_id, sales_type, amount)
             VALUES (:report_id, :sales_type, :amount)'
        );
        foreach ($reportSales as $salesType => $amount) {
            if ($amount > 0) {
                $insertReportSale->execute([
                    'report_id' => $reportId,
                    'sales_type' => $salesType,
                    'amount' => $amount,
                ]);
            }
        }

        $insertPayment = $pdo->prepare(
            'INSERT INTO report_payments
                (report_id, payment_method_id, payment_source, amount)
             VALUES
                (:report_id, :payment_method_id, :payment_source, :amount)'
        );
        foreach ($paymentRows as $paymentRow) {
            $insertPayment->execute([
                'report_id' => $reportId,
                'payment_method_id' => $paymentRow['payment_method_id'],
                'payment_source' => $paymentRow['payment_source'],
                'amount' => $paymentRow['amount'],
            ]);
        }

        $insertOwnerAccount = $pdo->prepare(
            "INSERT INTO report_accounts
                (report_id, account_holder_id, account_category, transaction_type, amount)
             VALUES
                (:report_id, :account_holder_id, 'owners_account', 'charge', :amount)"
        );
        foreach ($ownerAccounts as $accountId => $amount) {
            if ($amount > 0) {
                $insertOwnerAccount->execute([
                    'report_id' => $reportId,
                    'account_holder_id' => (int) $accountId,
                    'amount' => $amount,
                ]);
            }
        }

        $insertDeduction = $pdo->prepare(
            "INSERT INTO report_deductions
                (report_id, discount_type_id, deduction_type, amount)
             VALUES
                (:report_id, :discount_type_id, 'discount', :amount)"
        );
        foreach ($deductionRows as $deductionRow) {
            $insertDeduction->execute([
                'report_id' => $reportId,
                'discount_type_id' => $deductionRow['discount_type_id'],
                'amount' => $deductionRow['amount'],
            ]);
        }

        $pdo->commit();
        respond(200, [
            'success' => true,
            'message' => $action === 'add'
                ? 'Sales report added successfully.'
                : 'Sales report updated successfully.',
        ]);
    }

    if ($method !== 'GET') {
        header('Allow: GET, POST');
        respond(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $salesStatement = $pdo->query(
        "SELECT
            dr.report_id,
            dr.report_number,
            dr.report_date,
            dr.shift_name,
            COALESCE(bar_sales.bar_sales_total, 0) AS bar_sales_total,
            COALESCE(kitchen_sales.kitchen_sales_total, 0) AS kitchen_sales_total,
            COALESCE(corkage_sales.corkage_total, 0) AS corkage_total,
            COALESCE(service_charges.service_charge_total, 0) AS service_charge_total,
            COALESCE(grab_sales.grab_sale_gross, 0) AS grab_sale_gross,
            dr.total_tables,
            dr.total_pax,
            dr.telegram_declared_total,
            dr.pos_sales_total,
            dr.status,
            dr.notes,
            u.full_name,
            COALESCE(payments.payment_total, 0) AS payment_total
        FROM daily_reports dr
        INNER JOIN users u ON u.user_id = dr.cashier_id
        LEFT JOIN (
            SELECT report_id, SUM(amount) AS bar_sales_total
            FROM report_sales
            WHERE sales_type = 'bar'
            GROUP BY report_id
        ) bar_sales ON bar_sales.report_id = dr.report_id
        LEFT JOIN (
            SELECT report_id, SUM(amount) AS kitchen_sales_total
            FROM report_sales
            WHERE sales_type = 'kitchen'
            GROUP BY report_id
        ) kitchen_sales ON kitchen_sales.report_id = dr.report_id
        LEFT JOIN (
            SELECT report_id, SUM(amount) AS corkage_total
            FROM report_sales
            WHERE sales_type = 'corkage'
            GROUP BY report_id
        ) corkage_sales ON corkage_sales.report_id = dr.report_id
        LEFT JOIN (
            SELECT report_id, SUM(amount) AS service_charge_total
            FROM report_sales
            WHERE sales_type = 'service_charge'
            GROUP BY report_id
        ) service_charges ON service_charges.report_id = dr.report_id
        LEFT JOIN (
            SELECT report_id, SUM(amount) AS grab_sale_gross
            FROM report_sales
            WHERE sales_type = 'grab_gross'
            GROUP BY report_id
        ) grab_sales ON grab_sales.report_id = dr.report_id
        LEFT JOIN (
            SELECT report_id, SUM(amount) AS payment_total
            FROM report_payments
            WHERE payment_source = 'sales'
            GROUP BY report_id
        ) payments ON payments.report_id = dr.report_id
        ORDER BY dr.report_date DESC, dr.report_id DESC"
    );

    $sales = [];
    $nonPosSales = 0.0;
    $nonPosTransactions = 0;
    foreach ($salesStatement->fetchAll() as $row) {
        $savedFields = json_decode((string) ($row['notes'] ?? ''), true);
        $savedChannel = is_array($savedFields)
            ? strtoupper(trim((string) ($savedFields['saleChannel'] ?? '')))
            : '';
        $notesCashierName = '';
        if (is_array($savedFields)) {
            foreach (['cashierName', 'cashier_name', 'cashier'] as $cashierKey) {
                if (isset($savedFields[$cashierKey]) && is_scalar($savedFields[$cashierKey])) {
                    $notesCashierName = trim((string) $savedFields[$cashierKey]);
                    if ($notesCashierName !== '') {
                        break;
                    }
                }
            }
        }
        $cashRemitted = (float) $row['payment_total'];
        $savedOwnerAccounts = [];
        $savedUnpaidAccounts = [];
        $savedOtherPayments = [
            'otherCash' => '0',
            'otherCardMayaTerminal' => '0',
            'otherDirectBpiNooma' => '0',
            'otherDirectEastwestNooma' => '0',
            'otherGiftCheck' => '0',
            'otherCheque' => '0',
        ];
        $savedDeductions = [
            'pwdDiscount' => '0',
            'seniorCitizenDiscount' => '0',
            'specialCustomerDiscount' => '0',
        ];
        $savedPaymentFields = array_fill_keys([
            'cashRemitted',
            'gcashQrph',
            'paymaya',
            'amex',
            'visa',
            'mastercard',
            'bancnet',
            'jcb',
            'bpiNooma',
            'eastwestNooma',
            'giftCheck',
            'chequePayment',
        ], '0');
        $savedSalesBreakdown = [
            'kitchenSales' => (string) $row['kitchen_sales_total'],
            'barSales' => (string) $row['bar_sales_total'],
            'corkage' => (string) $row['corkage_total'],
            'totalSaleKsBsCorkage' => (string) (
                (float) $row['kitchen_sales_total'] +
                (float) $row['bar_sales_total'] +
                (float) $row['corkage_total']
            ),
            'grabSaleGross' => (string) $row['grab_sale_gross'],
            'grabSaleLess27' => '0',
        ];
        if (is_array($savedFields)) {
            foreach (['cashRemitted', 'cash_remitted', 'cashRemit', 'cash_remit'] as $cashKey) {
                if (isset($savedFields[$cashKey]) && is_numeric($savedFields[$cashKey])) {
                    $cashRemitted = (float) $savedFields[$cashKey];
                    break;
                }
            }
            if (isset($savedFields['ownerAccounts']) && is_array($savedFields['ownerAccounts'])) {
                foreach ($savedFields['ownerAccounts'] as $accountId => $amount) {
                    if (ctype_digit((string) $accountId) && is_numeric($amount) && (float) $amount >= 0) {
                        $savedOwnerAccounts[(string) $accountId] = (string) $amount;
                    }
                }
            }
            if (isset($savedFields['unpaidAccounts']) && is_array($savedFields['unpaidAccounts'])) {
                foreach ($savedFields['unpaidAccounts'] as $unpaidAccount) {
                    if (!is_array($unpaidAccount)) {
                        continue;
                    }
                    $accountName = trim((string) ($unpaidAccount['accountName'] ?? ''));
                    $amount = $unpaidAccount['amount'] ?? null;
                    if ($accountName === '' || !is_numeric($amount) || (float) $amount < 0) {
                        continue;
                    }
                    $savedUnpaidAccounts[] = [
                        'accountName' => $accountName,
                        'amount' => (string) $amount,
                        'notes' => is_scalar($unpaidAccount['notes'] ?? null)
                            ? (string) $unpaidAccount['notes']
                            : '',
                    ];
                }
            }
            if (isset($savedFields['otherPayments']) && is_array($savedFields['otherPayments'])) {
                foreach ($savedOtherPayments as $paymentField => $defaultAmount) {
                    $amount = $savedFields['otherPayments'][$paymentField]
                        ?? $savedFields[$paymentField]
                        ?? null;
                    if (is_numeric($amount) && (float) $amount >= 0) {
                        $savedOtherPayments[$paymentField] = (string) $amount;
                    }
                }
            }
            if (isset($savedFields['deductions']) && is_array($savedFields['deductions'])) {
                foreach ($savedDeductions as $deductionField => $defaultAmount) {
                    $amount = $savedFields['deductions'][$deductionField]
                        ?? $savedFields[$deductionField]
                        ?? null;
                    if (is_numeric($amount) && (float) $amount >= 0) {
                        $savedDeductions[$deductionField] = (string) $amount;
                    }
                }
            }
            if (isset($savedFields['paymentFields']) && is_array($savedFields['paymentFields'])) {
                foreach ($savedPaymentFields as $paymentField => $defaultAmount) {
                    $amount = $savedFields['paymentFields'][$paymentField]
                        ?? $savedFields[$paymentField]
                        ?? null;
                    if (is_numeric($amount) && (float) $amount >= 0) {
                        $savedPaymentFields[$paymentField] = (string) $amount;
                    }
                }
            }
            $legacySalesFields = [
                'kitchenSales' => 'kitchenSale',
                'barSales' => 'barSale',
                'corkage' => 'corkage',
                'totalSaleKsBsCorkage' => 'totalSale',
                'grabSaleGross' => 'grabSaleGross',
                'grabSaleLess27' => 'grabSaleLess27',
            ];
            $savedSalesBreakdownInput = $savedFields['salesBreakdown'] ?? [];
            if (!is_array($savedSalesBreakdownInput)) {
                $savedSalesBreakdownInput = [];
            }
            foreach ($savedSalesBreakdown as $salesField => $defaultAmount) {
                $amount = $savedSalesBreakdownInput[$salesField]
                    ?? $savedFields[$legacySalesFields[$salesField]]
                    ?? null;
                if (is_numeric($amount) && (float) $amount >= 0) {
                    $savedSalesBreakdown[$salesField] = (string) $amount;
                }
            }
        }
        $isNonPos = $savedChannel === 'NON POS'
            || ($savedChannel !== 'POS' && (float) $row['pos_sales_total'] <= 0);

        if ($isNonPos) {
            $nonPosSales += (float) $row['telegram_declared_total'];
            $nonPosTransactions++;
        }

        $sales[] = [
            'reportId' => (int) $row['report_id'],
            'reportNumber' => (string) $row['report_number'],
            'reportDate' => (string) $row['report_date'],
            'shiftName' => (string) $row['shift_name'],
            'barSalesTotal' => (float) $row['bar_sales_total'],
            'kitchenSalesTotal' => (float) $row['kitchen_sales_total'],
            'corkageTotal' => (float) $row['corkage_total'],
            'serviceChargeTotal' => (float) $row['service_charge_total'],
            'grabSaleGross' => (float) $savedSalesBreakdown['grabSaleGross'],
            'grabSaleLess27' => (string) $savedSalesBreakdown['grabSaleLess27'],
            'totalSaleKsBsCorkage' => (string) $savedSalesBreakdown['totalSaleKsBsCorkage'],
            'kitchenSales' => (string) $savedSalesBreakdown['kitchenSales'],
            'barSales' => (string) $savedSalesBreakdown['barSales'],
            'corkage' => (string) $savedSalesBreakdown['corkage'],
            'totalTables' => (int) $row['total_tables'],
            'totalPax' => (int) $row['total_pax'],
            'telegramDeclaredTotal' => (float) $row['telegram_declared_total'],
            'posSalesTotal' => (float) $row['pos_sales_total'],
            'status' => (string) $row['status'],
            'cashierName' => $notesCashierName !== ''
                ? $notesCashierName
                : (string) $row['full_name'],
            'paymentTotal' => $cashRemitted,
            'saleChannel' => $isNonPos ? 'NON POS' : 'POS',
            'ownerAccounts' => (object) $savedOwnerAccounts,
            'unpaidAccounts' => $savedUnpaidAccounts,
            'otherPayments' => (object) $savedOtherPayments,
            'deductions' => (object) $savedDeductions,
            'paymentFields' => (object) $savedPaymentFields,
        ];
    }

    $ownerAccounts = $pdo->query(
        "SELECT account_holder_id, account_name
         FROM account_holders
         WHERE is_active = 1 AND account_type = 'owner'
         ORDER BY account_name ASC"
    )->fetchAll();
    $ownerAccounts = array_map(static fn(array $owner): array => [
        'account_holder_id' => (int) $owner['account_holder_id'],
        'account_name' => (string) $owner['account_name'],
    ], $ownerAccounts);

    $stats = $pdo->query(
        'SELECT COALESCE(SUM(pos_sales_total), 0) AS total_sales, COUNT(*) AS total_transactions
         FROM daily_reports'
    )->fetch();

    $shiftStatement = $pdo->query(
        'SELECT report_id, report_date, shift_name FROM daily_reports'
    );
    $latestShiftSale = null;
    foreach ($shiftStatement->fetchAll() as $sale) {
        if (!preg_match('/(?:^|\s)(Lunch|Closing)(?:\s|$)/i', (string) $sale['shift_name'], $shiftMatch)) {
            continue;
        }

        if (
            $latestShiftSale === null
            || $sale['report_date'] > $latestShiftSale['date']
            || (
                $sale['report_date'] === $latestShiftSale['date']
                && (int) $sale['report_id'] > $latestShiftSale['reportId']
            )
        ) {
            $latestShiftSale = [
                'reportId' => (int) $sale['report_id'],
                'date' => (string) $sale['report_date'],
                'type' => ucfirst(strtolower($shiftMatch[1])),
            ];
        }
    }

    $nextSaleDate = date('Y-m-d');
    $nextSaleType = 'Lunch';
    if ($latestShiftSale !== null) {
        $latestDate = DateTimeImmutable::createFromFormat('!Y-m-d', $latestShiftSale['date']);
        if ($latestDate !== false) {
            if ($latestShiftSale['type'] === 'Lunch') {
                $nextSaleDate = $latestDate->format('Y-m-d');
                $nextSaleType = 'Closing';
            } else {
                $nextSaleDate = $latestDate->modify('+1 day')->format('Y-m-d');
            }
        }
    }

    respond(200, [
        'success' => true,
        'data' => [
            'sales' => $sales,
            'ownerAccounts' => $ownerAccounts,
            'stats' => [
                'totalSales' => (float) $stats['total_sales'],
                'totalTransactions' => (int) $stats['total_transactions'],
                'nonPosSales' => $nonPosSales,
                'nonPosTransactions' => $nonPosTransactions,
            ],
            'nextSale' => [
                'date' => $nextSaleDate,
                'type' => $nextSaleType,
            ],
        ],
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    if ($error instanceof PDOException && ($error->errorInfo[1] ?? null) === 1062) {
        respond(409, ['success' => false, 'message' => 'A report with that report number already exists.']);
    }

    error_log('Sales reports API error: ' . $error->getMessage());
    respond(500, ['success' => false, 'message' => 'Unable to load sales reports. Check the sales database schema.']);
}
