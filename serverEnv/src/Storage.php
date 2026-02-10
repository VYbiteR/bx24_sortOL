<?php

final class Storage
{
    public function __construct(private string $dir)
    {
        if (!is_dir($dir)) mkdir($dir, 0775, true);
    }

    private function path(string $portal, string $name): string
    {
        $safe = preg_replace('~[^a-z0-9\.\-_]~i', '_', $portal);
        return $this->dir . "/{$safe}.{$name}.json";
    }

    public function loadJson(string $portal, string $name): ?array
    {
        $p = $this->path($portal, $name);
        if (!is_file($p)) return null;
        $raw = file_get_contents($p);
        return $raw ? json_decode($raw, true) : null;
    }

    public function saveJson(string $portal, string $name, array $data): void
    {
        $p = $this->path($portal, $name);
        $tmp = $p . '.' . uniqid('tmp_', true);
        file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
        rename($tmp, $p);
    }

    public function loadRaw(string $portal, string $name): ?string
    {
        $safe = preg_replace('~[^a-z0-9\.\-_]~i', '_', $portal);
        $p = $this->dir . "/{$safe}.{$name}";
        return is_file($p) ? file_get_contents($p) : null;
    }

    public function saveRaw(string $portal, string $name, string $raw): void
    {
        $safe = preg_replace('~[^a-z0-9\.\-_]~i', '_', $portal);
        $p = $this->dir . "/{$safe}.{$name}";
        $tmp = $p . '.' . uniqid('tmp_', true);
        file_put_contents($tmp, $raw);
        rename($tmp, $p);
    }
}
