<?php
declare(strict_types=1);

// Установка локального приложения Битрикс24.
// В режиме "работаем из Битрикса" ничего не редиректим на /oauth/authorize/.
// Достаточно сообщить порталу, что установка завершена.
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <script src="//api.bitrix24.com/api/v1/"></script>
  <script>
    BX24.init(function () {
      BX24.installFinish();
    });
  </script>
</head>
<body>installation has been finished</body>
</html>
