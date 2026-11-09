<?php
// login.php
session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit();
}

require_once __DIR__ . '/../database/conn.php';

// Read input (JSON or Standard POST)
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

$loginInput = trim($data['email'] ?? $data['username'] ?? $_POST['email'] ?? $_POST['username'] ?? '');
$password   = trim($data['password'] ?? $_POST['password'] ?? '');
$remember   = !empty($data['remember'] ?? $_POST['remember'] ?? false);

if (empty($loginInput) || empty($password)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Please provide your username/email and password.'
    ]);
    exit();
}

try {
    // Select exact table columns matching your database schema
    $stmt = $pdo->prepare('
        SELECT `user_id`, `full_name`, `username`, `password_hash`, `role`, `is_active` 
        FROM `users` 
        WHERE `username` = :loginInput 
        LIMIT 1
    ');
    
    $stmt->execute(['loginInput' => $loginInput]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password_hash'])) {
        
        // Block inactive accounts
        if ((int)$user['is_active'] !== 1) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'Account is suspended or inactive. Please contact management.'
            ]);
            exit();
        }

        // Prevent session fixation
        session_regenerate_id(true);

        // Store user state in session
        $_SESSION['user_id']   = $user['user_id'];
        $_SESSION['username']  = $user['username'];
        $_SESSION['full_name'] = $user['full_name'];
        $_SESSION['role']      = $user['role'];

        if ($remember) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                session_id(),
                time() + (86400 * 30), // 30 Days persistence
                $params['path'],
                $params['domain'],
                $params['secure'],
                $params['httponly']
            );
        }

        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'user'    => [
                'user_id'   => $user['user_id'],
                'full_name' => $user['full_name'],
                'username'  => $user['username'],
                'role'      => $user['role']
            ]
        ]);
        exit();
    }

    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid username or password credentials.'
    ]);
    exit();

} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error occurred.'
    ]);
    exit();
}