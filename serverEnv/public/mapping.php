<?php
declare(strict_types=1);

$portal = strtolower(trim($_GET['portal'] ?? ''));
if ($portal === '' || !preg_match('~^[a-z0-9.-]+$~', $portal)) {
    http_response_code(400);
    exit('bad portal');
}

if (($_SERVER['HTTP_X_ANIT_AGENT'] ?? '') !== 'anitBXChatSorter') {
    http_response_code(403);
    exit('forbidden');
}

$path = __DIR__ . "/data/{$portal}.json";
if (!is_file($path)) {
    http_response_code(404);
    exit('not found');
}

$body = file_get_contents($path);
if ($body === false) {
    http_response_code(500);
    exit('read error');
}

$etag = hash('sha256', $body);
$ifNone = str_replace('"', '', trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=0, must-revalidate');
header('ETag: "' . $etag . '"');

if ($ifNone !== '' && hash_equals($etag, $ifNone)) {
    http_response_code(304);
    exit;
}

echo $body;
