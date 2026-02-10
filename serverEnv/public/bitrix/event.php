<?php
declare(strict_types=1);

// REST event handler (OnTaskAdd / OnTaskUpdate) for Bitrix24 local app.
// Работает без OAuth/SDK: использует access_token, который приходит в payload события.

$config = require __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../src/Storage.php';

function ev_fail(int $code, string $message): never
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    exit($message);
}

function ev_call(string $portalUrl, string $accessToken, string $method, array $params = []): array
{
    $url = rtrim($portalUrl, '/') . '/rest/' . ltrim($method, '/') . '.json';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(array_merge($params, ['auth' => $accessToken])),
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('curl: ' . $err);
    }
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        throw new RuntimeException("Bad JSON ({$code}): {$raw}");
    }
    if (isset($json['error'])) {
        $desc = (string)($json['error_description'] ?? '');
        throw new RuntimeException(trim("B24 REST error {$json['error']}" . ($desc !== '' ? ": {$desc}" : '')));
    }
    return $json;
}

$payload = $_POST ?: (json_decode(file_get_contents('php://input') ?: '', true) ?: []);
$auth = is_array($payload['auth'] ?? null) ? $payload['auth'] : [];
$data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

$domain = strtolower(trim((string)($auth['domain'] ?? '')));
$protocol = trim((string)($auth['protocol'] ?? 'https'));
$accessToken = trim((string)($auth['access_token'] ?? ''));

if ($domain === '' || !preg_match('~^[a-z0-9.-]+$~', $domain)) {
    // Событие без домена — просто игнор
    http_response_code(200);
    exit('NO_DOMAIN');
}

$allowed = strtolower(trim((string)($config['allowed_domain'] ?? '')));
if ($allowed !== '' && $domain !== $allowed) {
    http_response_code(200);
    exit('IGNORED_DOMAIN');
}

$portalUrl = $protocol . '://' . $domain;

// optional verification by application_token (получаем сами, если он вообще приходит)
$storage = new Storage($config['storage_dir']);
$appToken = trim((string)($auth['application_token'] ?? ''));
if ($appToken !== '') {
    $meta = $storage->loadJson($portalUrl, 'event_meta') ?: [];
    $stored = trim((string)($meta['application_token'] ?? ''));
    if ($stored === '') {
        $meta['application_token'] = $appToken;
        $meta['saved_at'] = time();
        $storage->saveJson($portalUrl, 'event_meta', $meta);
    } elseif (!hash_equals($stored, $appToken)) {
        ev_fail(403, 'BAD_APP_TOKEN');
    }
}

// task id может лежать по-разному
$taskId = $data['ID'] ?? ($data['FIELDS']['ID'] ?? null);
$taskId = is_numeric($taskId) ? (int)$taskId : 0;
if ($taskId <= 0) {
    http_response_code(200);
    exit('NO_TASK_ID');
}

if ($accessToken === '') {
    // Не можем сходить в REST — пометим "грязным" для ручной пересборки
    $storage->saveJson($portalUrl, 'bundle_meta', ['dirty' => true, 'dirty_at' => time(), 'reason' => 'no_access_token']);
    http_response_code(200);
    exit('NO_ACCESS_TOKEN');
}

try {
    $task = ev_call($portalUrl, $accessToken, 'tasks.task.get', ['taskId' => $taskId]);
} catch (Throwable $e) {
    // не фейлим событие жёстко — чтобы не долбить ретраями
    $storage->saveJson($portalUrl, 'bundle_meta', ['dirty' => true, 'dirty_at' => time(), 'reason' => 'tasks.task.get failed: '.$e->getMessage()]);
    http_response_code(200);
    exit('TASK_GET_FAILED');
}

$fields = $task['result']['task'] ?? null;
if (!is_array($fields)) {
    http_response_code(200);
    exit('NO_TASK_FIELDS');
}

$chatId  = (int)($fields['CHAT_ID'] ?? 0);
$groupId = (int)($fields['GROUP_ID'] ?? 0);

$raw = $storage->loadJson($portalUrl, 'raw_map') ?: ['map' => [], 'updated_at' => 0];
if (!isset($raw['map']) || !is_array($raw['map'])) $raw['map'] = [];

if ($chatId > 0) {
    $raw['map'][(string)$chatId] = $groupId;
    $raw['updated_at'] = time();
    $storage->saveJson($portalUrl, 'raw_map', $raw);
}

// помечаем, что bundle надо пересобрать (если вы используете raw_map + MappingBuilder где-то дальше)
$storage->saveJson($portalUrl, 'bundle_meta', ['dirty' => true, 'dirty_at' => time()]);

http_response_code(200);
header('Content-Type: text/plain; charset=utf-8');
echo 'OK';

