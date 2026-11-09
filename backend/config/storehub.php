<?php
// Keep credentials outside the public folder where possible.
return [
    'base_url' => 'https://api.storehubhq.com',
    'username' => getenv('STOREHUB_USER') ?: 'noomakitchen',
    'password' => getenv('STOREHUB_PASS') ?: '6ba682dd17084c7b94a116cce39c72f2',
    'store_id' => getenv('STOREHUB_STORE_ID') ?: 'YOUR_STORE_ID',
];