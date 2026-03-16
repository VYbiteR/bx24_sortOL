$ErrorActionPreference = "Stop"

$baseDir = "C:\ProgramData\ANIT\bx24_sortOL"
$configPath = Join-Path $baseDir "config.json"
$tempDir = Join-Path $baseDir "temp"
$backupDir = Join-Path $baseDir "backup"
$stateFile = Join-Path $baseDir "last-update.json"

function Normalize-Version([string]$version) {
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "Пустая версия"
    }

    return ($version.Trim() -replace '^[vV]', '')
}

function Ensure-Dir([string]$path) {
    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function Save-State(
    [string]$status,
    [AllowNull()][string]$fromVersion,
    [AllowNull()][string]$toVersion,
    [string]$message
) {
    $state = [ordered]@{
        checkedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        status = $status
        fromVersion = $fromVersion
        toVersion = $toVersion
        message = $message
    }

    ($state | ConvertTo-Json -Depth 3) | Set-Content -Path $stateFile -Encoding UTF8
}

Ensure-Dir $baseDir
Ensure-Dir $tempDir
Ensure-Dir $backupDir

$localVersion = $null

try {
    if (!(Test-Path $configPath)) {
        throw "Не найден config.json"
    }

    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    $repoApiUrl = $config.repoApiUrl
    $assetName = $config.assetName
    $extensionPath = $config.extensionPath

    if ([string]::IsNullOrWhiteSpace($repoApiUrl)) {
        throw "В config.json не указан repoApiUrl"
    }

    if ([string]::IsNullOrWhiteSpace($assetName)) {
        throw "В config.json не указан assetName"
    }

    if ([string]::IsNullOrWhiteSpace($extensionPath)) {
        throw "В config.json не указан extensionPath"
    }

    if (!(Test-Path $extensionPath)) {
        throw "Не найдена папка расширения"
    }

    $manifestPath = Join-Path $extensionPath "manifest.json"
    if (!(Test-Path $manifestPath)) {
        throw "Не найден manifest.json"
    }

    $localManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $localVersion = Normalize-Version $localManifest.version

    $headers = @{
        "User-Agent" = "ANIT-bx24_sortOL-Updater"
        "Accept" = "application/vnd.github+json"
    }

    $release = Invoke-RestMethod -Uri $repoApiUrl -Headers $headers -Method Get
    $tagName = ($release.tag_name | Out-String).Trim()

    if ([string]::IsNullOrWhiteSpace($tagName)) {
        throw "В ответе GitHub отсутствует tag_name"
    }

    $remoteVersion = Normalize-Version $tagName

    if ([version]$remoteVersion -le [version]$localVersion) {
        Save-State "no_update" $localVersion $remoteVersion "Обновление не требуется"
        exit 0
    }

    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    if (-not $asset) {
        throw "Не найден asset $assetName"
    }

    $downloadUrl = $asset.browser_download_url
    if ([string]::IsNullOrWhiteSpace($downloadUrl)) {
        throw "У asset отсутствует browser_download_url"
    }

    $expectedDigest = ""
    if ($asset.PSObject.Properties.Name -contains "digest" -and $asset.digest) {
        $expectedDigest = ($asset.digest -replace '^sha256:', '').ToLower()
    }

    $zipPath = Join-Path $tempDir "bx24_sortOL.zip"
    $extractPath = Join-Path $tempDir "extract"
    $backupCurrentPath = Join-Path $backupDir "current"

    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }

    if (Test-Path $extractPath) {
        Remove-Item $extractPath -Recurse -Force
    }

    if (Test-Path $backupCurrentPath) {
        Remove-Item $backupCurrentPath -Recurse -Force
    }

    New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
    New-Item -ItemType Directory -Path $backupCurrentPath -Force | Out-Null

    Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $zipPath

    if ($expectedDigest) {
        $actualHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedDigest) {
            throw "Хэш архива не совпадает"
        }
    }

    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    $newManifestPath = Join-Path $extractPath "manifest.json"
    if (!(Test-Path $newManifestPath)) {
        throw "В архиве не найден manifest.json"
    }

    $newManifest = Get-Content $newManifestPath -Raw | ConvertFrom-Json
    $archiveVersion = Normalize-Version $newManifest.version

    if ($archiveVersion -ne $remoteVersion) {
        throw "Версия в архиве не совпадает с релизом"
    }

    Copy-Item -Path (Join-Path $extensionPath "*") -Destination $backupCurrentPath -Recurse -Force
    Get-ChildItem -Path $extensionPath -Force | Remove-Item -Recurse -Force
    Copy-Item -Path (Join-Path $extractPath "*") -Destination $extensionPath -Recurse -Force

    Save-State "updated" $localVersion $remoteVersion "Обновление выполнено успешно"
    exit 0
}
catch {
    Save-State "error" $localVersion $null $_.Exception.Message
    exit 1
}
