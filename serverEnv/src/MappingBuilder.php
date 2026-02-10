<?php

final class MappingBuilder
{
    public function __construct(
        private Storage $storage,
        private Bitrix24Client $client,
        private string $portal
    ) {}

    public function rebuild(array $filters): array
    {
        // 1) Сбор задач через tasks.task.list постранично
        $start = 0;
        $map = [];       // chatIdNumber => groupId
        $groupIds = [0]; // 0 = без проекта

        while (true) {
            $resp = $this->client->call('tasks.task.list', [
                'filter' => $filters,
                'select' => ['ID','GROUP_ID','CHAT_ID'], // минимум
                'start'  => $start,
            ]);

            $tasks = $resp['result']['tasks'] ?? [];
            foreach ($tasks as $t) {
                // В зависимости от версии REST, ключи могут быть в разных регистрах/форматах
                $chatId  = (int)($t['chatId'] ?? $t['CHAT_ID'] ?? $t['CHATID'] ?? 0);
                $groupId = (int)($t['groupId'] ?? $t['GROUP_ID'] ?? $t['GROUPID'] ?? 0);
                if ($chatId > 0) {
                    $map[(string)$chatId] = $groupId;
                    $groupIds[$groupId] = $groupId;
                }
            }

            $next = $resp['next'] ?? null;
            if ($next === null) break;
            $start = (int)$next;
        }

        // 2) Получить имена проектов (групп)
        // В облаке проще: несколько запросов sonet_group.get через batch
        $groups = $this->fetchGroups(array_values($groupIds)); // groupId=>name
        $groups[0] = 'Без проекта';

        // 3) Сохранить сырое и собрать бандл
        $raw = ['map' => $map, 'groups' => $groups, 'updated_at' => time()];
        $this->storage->saveJson($this->portal, 'raw_map', $raw);

        return $this->buildBundle($raw);
    }

    private function fetchGroups(array $groupIds): array
    {
        $groupIds = array_values(array_filter($groupIds, fn($id)=>$id>0));
        if (!$groupIds) return [];

        $result = [];
        $chunks = array_chunk($groupIds, 50);

        foreach ($chunks as $chunk) {
            $cmd = [];
            foreach ($chunk as $i => $gid) {
                $cmd["g{$i}"] = "sonet_group.get?" . http_build_query(['ID' => (int)$gid]);
            }
            $batch = $this->client->call('batch', ['cmd' => $cmd]);

            $res = $batch['result']['result'] ?? [];
            foreach ($res as $item) {
                // batch может вернуть как [ [group], ... ], так и {result:[...]} в зависимости от прокси/версии
                $list = isset($item['result']) ? $item['result'] : (is_array($item) ? $item : []);
                if (!is_array($list)) $list = [$list];
                foreach ($list as $g) {
                    if (is_array($g) && isset($g['ID'])) {
                        $result[(int)$g['ID']] = (string)($g['NAME'] ?? ('#'.$g['ID']));
                    }
                }
            }
        }

        return $result;
    }

    public function buildBundle(array $raw): array
    {
        // projects: [ [groupId, name], ... ] с индексами
        $groups = $raw['groups'] ?? [];
        ksort($groups);

        $projects = [];
        $indexByGroup = [];
        foreach ($groups as $gid => $name) {
            $indexByGroup[(int)$gid] = count($projects);
            $projects[] = [(int)$gid, (string)$name];
        }
        if (!isset($indexByGroup[0])) {
            $indexByGroup[0] = count($projects);
            $projects[] = [0, 'Без проекта'];
        }

        // mapPairs: [ [chatIdNumber, projectIndex], ... ]
        $pairs = [];
        foreach (($raw['map'] ?? []) as $chatIdStr => $gid) {
            $chatId = (int)$chatIdStr;
            $g = (int)$gid;
            $pairs[] = [$chatId, $indexByGroup[$g] ?? $indexByGroup[0]];
        }
        usort($pairs, fn($a,$b)=>$a[0]<=>$b[0]);

        // Delta-encoding: [firstChatId, idx, delta, idx, delta, idx...]
        $delta = [];
        if ($pairs) {
            $prev = $pairs[0][0];
            $delta[] = $prev;
            $delta[] = $pairs[0][1];
            for ($i=1; $i<count($pairs); $i++) {
                $d = $pairs[$i][0] - $prev;
                $prev = $pairs[$i][0];
                $delta[] = $d;
                $delta[] = $pairs[$i][1];
            }
        }

        $bundle = [
            'v'        => 1,
            'ts'       => time(),
            'projects' => $projects,
            'dmap'     => $delta,
        ];

        $json = json_encode($bundle, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $etag = hash('sha256', $json);

        $this->storage->saveRaw($this->portal, 'bundle.json', $json);
        $this->storage->saveJson($this->portal, 'bundle_meta', [
            'etag' => $etag,
            'ts' => $bundle['ts'],
            'count' => count($pairs),
            'dirty' => false,
        ]);

        return ['etag'=>$etag, 'json'=>$json, 'count'=>count($pairs)];
    }
}
