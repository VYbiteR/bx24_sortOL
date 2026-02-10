<?php
// Загрузка .env из корня serverEnv (если файл есть)
$envFile = __DIR__ . '/.env';
if (is_file($envFile) && is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            [$name, $value] = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\"'");
            if ($name !== '') putenv("$name=$value");
        }
    }
}

return [
    'storage_dir'   => __DIR__ . '/var',
    'gzip'          => true,
    'etag_algo'     => 'sha256',

    // Ограничение по порталу (опционально): если задано — пускаем только этот DOMAIN
    'allowed_domain'       => getenv('B24_ALLOWED_DOMAIN'),
];
