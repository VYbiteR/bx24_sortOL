<?php

final class Bitrix24Client
{
    public function __construct(
        private Storage $storage,
        private string $portal,          // например "https://yourdomain.bitrix24.ru"
        private string $clientId,
        private string $clientSecret,
        private ?string $accessTokenOverride = null
    ) {}

    public function call(string $method, array $params = []): array
    {
        $token = $this->getValidToken();

        $url = rtrim($this->portal, '/') . "/rest/{$method}.json";
        $resp = $this->postJson($url, array_merge($params, [
            'auth' => $token['access_token'],
        ]));

        // если токен истек — обновляем и повторяем 1 раз
        if (isset($resp['error']) && in_array($resp['error'], ['expired_token', 'invalid_token'], true)) {
            $this->refreshToken();
            $token = $this->getValidToken();
            $resp = $this->postJson($url, array_merge($params, ['auth' => $token['access_token']]));
        }

        if (isset($resp['error'])) {
            $desc = (string)($resp['error_description'] ?? '');
            throw new RuntimeException(trim("B24 REST error {$resp['error']}" . ($desc !== '' ? ": {$desc}" : '')));
        }

        return $resp;
    }

    private function getValidToken(): array
    {
        if ($this->accessTokenOverride !== null && $this->accessTokenOverride !== '') {
            return ['access_token' => $this->accessTokenOverride];
        }
        $t = $this->storage->loadJson($this->portal, 'token');
        if (!$t || empty($t['access_token'])) {
            throw new RuntimeException("No token for portal {$this->portal}");
        }
        return $t;
    }

    public function saveTokenFromOAuth(array $tokenPayload): void
    {
        // tokenPayload: access_token, refresh_token, expires_in, ...
        $tokenPayload['saved_at'] = time();
        $this->storage->saveJson($this->portal, 'token', $tokenPayload);
    }

    public function refreshToken(): void
    {
        if ($this->accessTokenOverride !== null && $this->accessTokenOverride !== '') {
            throw new RuntimeException('Token refresh is not available in placement-token mode');
        }
        $t = $this->getValidToken();
        if (empty($t['refresh_token'])) {
            throw new RuntimeException("No refresh_token for portal {$this->portal}");
        }

        $url = "https://oauth.bitrix.info/oauth/token/";
        $resp = $this->getJson($url, [
            'grant_type'    => 'refresh_token',
            'client_id'     => $this->clientId,
            'client_secret' => $this->clientSecret,
            'refresh_token' => $t['refresh_token'],
        ]);

        if (isset($resp['error'])) {
            throw new RuntimeException("Refresh error: " . json_encode($resp, JSON_UNESCAPED_UNICODE));
        }

        $this->saveTokenFromOAuth($resp);
    }

    private function postJson(string $url, array $fields): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($fields),
            CURLOPT_TIMEOUT        => 20,
        ]);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false) throw new RuntimeException("HTTP error calling {$url}");
        $json = json_decode($raw, true);
        if (!is_array($json)) throw new RuntimeException("Bad JSON ({$code}): {$raw}");
        return $json;
    }

    private function getJson(string $url, array $query): array
    {
        $u = $url . '?' . http_build_query($query);
        $ch = curl_init($u);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
        ]);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false) throw new RuntimeException("HTTP error calling {$u}");
        $json = json_decode($raw, true);
        if (!is_array($json)) throw new RuntimeException("Bad JSON ({$code}): {$raw}");
        return $json;
    }
}
