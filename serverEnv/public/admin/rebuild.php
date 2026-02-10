<?php
declare(strict_types=1);

require_once __DIR__ . '/../bitrix/placement_guard.php';

$config = require __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../src/Storage.php';
require_once __DIR__ . '/../../src/Bitrix24Client.php';
require_once __DIR__ . '/../../src/MappingBuilder.php';

$portalHost = (string)($B24_PLACEMENT['domain'] ?? '');
$portalUrl  = (string)($B24_PLACEMENT['portalUrl'] ?? '');
$authId     = (string)($B24_PLACEMENT['authId'] ?? '');

$filters = [];
if (!empty($_POST['createdFrom'])) $filters['>=CREATED_DATE'] = (string)$_POST['createdFrom'];
if (!empty($_POST['status'])) $filters['STATUS'] = (int) $_POST['status'];
if (!empty($_POST['responsibleId'])) $filters['RESPONSIBLE_ID'] = (int) $_POST['responsibleId'];

$storage = new Storage($config['storage_dir']);
$client  = new Bitrix24Client(
    $storage,
    $portalUrl,
    (string)($config['client_id'] ?? ''),
    (string)($config['client_secret'] ?? ''),
    $authId
);
$builder = new MappingBuilder($storage, $client, $portalUrl);

try {
    $res = $builder->rebuild($filters); // ['etag'=>..., 'json'=>..., 'count'=>...]
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERROR: {$e->getMessage()}\n";
    echo "Hint: откройте админку из Битрикс24 и убедитесь, что у приложения есть права на tasks/groups.\n";
    exit;
}

$dir = __DIR__ . '/../data';
if (!is_dir($dir)) mkdir($dir, 0775, true);
file_put_contents($dir . "/{$portalHost}.json", (string)$res['json']);

header('Content-Type: text/plain; charset=utf-8');
echo 'OK: portal=' . $portalHost . ' chats=' . (int)($res['count'] ?? 0) . ' etag=' . (string)($res['etag'] ?? '');
