<?php
declare(strict_types=1);

/**
 * Guard для страниц, которые должны открываться ИСКЛЮЧИТЕЛЬНО из Битрикс24 (placement).
 * Требует DOMAIN + AUTH_ID и проверяет, что пользователь — админ портала.
 *
 * На выходе устанавливает $B24_PLACEMENT:
 *   - domain (host)
 *   - portalUrl (https://domain)
 *   - authId (AUTH_ID)
 *   - memberId, appSid, refreshId (если пришли)
 *   - user (user.current result)
 */

$config = require __DIR__ . '/../../config.php';

function b24p_fail(int $code, string $message): never
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    exit($message);
}

function b24p_call(string $portalUrl, string $authId, string $method, array $params = []): array
{
    $url = rtrim($portalUrl, '/') . '/rest/' . ltrim($method, '/') . '.json';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(array_merge($params, ['auth' => $authId])),
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('curl: ' . $err);
    }
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
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

$domain = strtolower(trim((string)($_REQUEST['DOMAIN'] ?? $_REQUEST['domain'] ?? '')));
$authId = trim((string)($_REQUEST['AUTH_ID'] ?? $_REQUEST['auth_id'] ?? ''));
$memberId = trim((string)($_REQUEST['member_id'] ?? ''));
$appSid = trim((string)($_REQUEST['APP_SID'] ?? ''));
$refreshId = trim((string)($_REQUEST['REFRESH_ID'] ?? ''));

if ($domain === '' || !preg_match('~^[a-z0-9.-]+$~', $domain)) {
    b24p_fail(403, 'Откройте эту страницу из Битрикс24 (нет DOMAIN).');
}
if ($authId === '') {
    b24p_fail(403, 'Откройте эту страницу из Битрикс24 (нет AUTH_ID).');
}

$allowed = strtolower(trim((string)($config['allowed_domain'] ?? '')));
if ($allowed !== '' && $domain !== $allowed) {
    b24p_fail(403, 'Запрещённый портал (allowed_domain).');
}

$portalUrl = 'https://' . $domain;

try {
    $me = b24p_call($portalUrl, $authId, 'user.current');
    $adm = b24p_call($portalUrl, $authId, 'user.admin');
} catch (Throwable $e) {
    b24p_fail(403, 'Ошибка проверки доступа: ' . $e->getMessage());
}

$admRes = $adm['result'] ?? false;
$isAdmin = ($admRes === true || $admRes === 1 || $admRes === '1' || strtoupper((string)$admRes) === 'Y');
if (!$isAdmin) {
    b24p_fail(403, 'Доступ запрещён: требуются права администратора портала Битрикс24.');
}

$B24_PLACEMENT = [
    'domain' => $domain,
    'portalUrl' => $portalUrl,
    'authId' => $authId,
    'memberId' => $memberId,
    'appSid' => $appSid,
    'refreshId' => $refreshId,
    'user' => $me['result'] ?? [],
];

