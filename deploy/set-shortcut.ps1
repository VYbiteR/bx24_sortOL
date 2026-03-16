param(
    [Parameter(Mandatory = $true)]
    [string]$ShortcutPath,

    [Parameter(Mandatory = $true)]
    [string]$BitrixExe,

    [Parameter(Mandatory = $true)]
    [string]$ExtensionPath
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BitrixExe)) {
    throw "Bitrix24.exe не найден: $BitrixExe"
}

if (!(Test-Path $ExtensionPath)) {
    throw "Папка расширения не найдена: $ExtensionPath"
}

$shortcutDir = Split-Path $ShortcutPath -Parent
if (!(Test-Path $shortcutDir)) {
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($ShortcutPath)

$shortcut.TargetPath = $BitrixExe
$shortcut.Arguments = "--disable-extensions-except=""$ExtensionPath"" --load-extension=""$ExtensionPath"""
$shortcut.WorkingDirectory = Split-Path $BitrixExe
$shortcut.IconLocation = "$BitrixExe,0"
$shortcut.Save()
