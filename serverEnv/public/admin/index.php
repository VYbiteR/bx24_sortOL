<?php
declare(strict_types=1);

require_once __DIR__ . '/../bitrix/placement_guard.php';

$portalHost = (string)($B24_PLACEMENT['domain'] ?? '');
$portalUrl  = (string)($B24_PLACEMENT['portalUrl'] ?? '');
$authId     = (string)($B24_PLACEMENT['authId'] ?? '');

$err = '';
$ok = '';
$check = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'check') {
    try {
        // scope — быстрый и наглядный способ понять, что токен рабочий и какие права есть
        $check = b24p_call($portalUrl, $authId, 'scope');
        $ok = 'REST OK';
    } catch (Throwable $e) {
        $err = $e->getMessage();
    }
}
?>
<!doctype html>
<html lang="ru"><meta charset="utf-8"><title>ANIT BX Chat Sorter Admin</title>
<body>
  <h3>Сбор маппинга</h3>
  <?php if ($err): ?><div style="color:#b00"><?= htmlspecialchars($err) ?></div><?php endif; ?>
  <?php if ($ok): ?><div style="color:#080"><?= htmlspecialchars($ok) ?></div><?php endif; ?>

  <div style="padding:10px 0">
    <div><b>Portal host:</b> <span><?= htmlspecialchars($portalHost) ?></span></div>
    <div style="margin-top:6px">
      <b>Режим:</b> <span>только из Битрикс24 (DOMAIN/AUTH_ID)</span>
    </div>

    <div style="margin-top:10px">
      <form method="post" style="display:inline">
        <input type="hidden" name="DOMAIN" value="<?= htmlspecialchars($portalHost) ?>">
        <input type="hidden" name="AUTH_ID" value="<?= htmlspecialchars($authId) ?>">
        <input type="hidden" name="member_id" value="<?= htmlspecialchars((string)($B24_PLACEMENT['memberId'] ?? '')) ?>">
        <input type="hidden" name="APP_SID" value="<?= htmlspecialchars((string)($B24_PLACEMENT['appSid'] ?? '')) ?>">
        <input type="hidden" name="REFRESH_ID" value="<?= htmlspecialchars((string)($B24_PLACEMENT['refreshId'] ?? '')) ?>">
        <input type="hidden" name="action" value="check">
        <button type="submit">Проверить REST (scope)</button>
      </form>
    </div>

    <?php if (is_array($check)): ?>
      <pre style="background:#f6f6f6;border:1px solid #ddd;padding:10px;white-space:pre-wrap"><?= htmlspecialchars(json_encode($check, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)) ?></pre>
    <?php endif; ?>
  </div>

  <?php
  // ---- bind events (optional) ----
  $bindInfo = null;
  if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'bind_events') {
      try {
          $scheme = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : ($_SERVER['REQUEST_SCHEME'] ?? 'http'));
          $host = $_SERVER['HTTP_HOST'] ?? '';
          $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/'); // /public/admin
          $publicBase = dirname($scriptDir); // /public
          $handler = $scheme . '://' . $host . $publicBase . '/bitrix/event.php';

          $r1 = b24p_call($portalUrl, $authId, 'event.bind', ['event' => 'OnTaskAdd', 'handler' => $handler]);
          $r2 = b24p_call($portalUrl, $authId, 'event.bind', ['event' => 'OnTaskUpdate', 'handler' => $handler]);
          $bindInfo = ['handler' => $handler, 'OnTaskAdd' => $r1, 'OnTaskUpdate' => $r2];
          $ok = 'События привязаны';
      } catch (Throwable $e) {
          $err = 'Bind events failed: ' . $e->getMessage();
      }
  }
  ?>

  <div style="margin-top:16px;padding:10px;border:1px solid #ddd;background:#fafafa">
    <div><b>События (опционально)</b></div>
    <div style="margin-top:6px;color:#555">Привязка `OnTaskAdd` и `OnTaskUpdate` к `public/bitrix/event.php`.</div>
    <form method="post" style="margin-top:8px">
      <input type="hidden" name="DOMAIN" value="<?= htmlspecialchars($portalHost) ?>">
      <input type="hidden" name="AUTH_ID" value="<?= htmlspecialchars($authId) ?>">
      <input type="hidden" name="member_id" value="<?= htmlspecialchars((string)($B24_PLACEMENT['memberId'] ?? '')) ?>">
      <input type="hidden" name="APP_SID" value="<?= htmlspecialchars((string)($B24_PLACEMENT['appSid'] ?? '')) ?>">
      <input type="hidden" name="REFRESH_ID" value="<?= htmlspecialchars((string)($B24_PLACEMENT['refreshId'] ?? '')) ?>">
      <input type="hidden" name="action" value="bind_events">
      <button type="submit">Привязать события</button>
    </form>
    <?php if (is_array($bindInfo)): ?>
      <pre style="margin-top:8px;background:#f6f6f6;border:1px solid #ddd;padding:10px;white-space:pre-wrap"><?= htmlspecialchars(json_encode($bindInfo, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)) ?></pre>
    <?php endif; ?>
  </div>

  <form id="rebuildForm" method="post" action="rebuild.php">
    <!-- пробрасываем параметры placement, чтобы rebuild.php мог работать тем же AUTH_ID -->
    <input type="hidden" name="DOMAIN" value="<?= htmlspecialchars($portalHost) ?>">
    <input type="hidden" name="AUTH_ID" value="<?= htmlspecialchars($authId) ?>">
    <input type="hidden" name="member_id" value="<?= htmlspecialchars((string)($B24_PLACEMENT['memberId'] ?? '')) ?>">
    <input type="hidden" name="APP_SID" value="<?= htmlspecialchars((string)($B24_PLACEMENT['appSid'] ?? '')) ?>">
    <input type="hidden" name="REFRESH_ID" value="<?= htmlspecialchars((string)($B24_PLACEMENT['refreshId'] ?? '')) ?>">

    <div style="margin-top:10px"><b>Фильтры (опционально)</b></div>
    <div>createdFrom (YYYY-MM-DD): <input name="createdFrom" placeholder="2026-01-01" style="width:160px"></div>
    <div>status: <input name="status" placeholder="например 2" style="width:160px"></div>
    <div>responsibleId: <input name="responsibleId" placeholder="например 123" style="width:160px"></div>
    <div style="margin-top:10px"><button type="submit">Пересобрать и сохранить в public/data</button></div>
  </form>
</body></html>
