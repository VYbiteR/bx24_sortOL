$ErrorActionPreference = "Stop"

$taskName = "ANIT bx24_sortOL Updater"
$scriptPath = "C:\ProgramData\ANIT\bx24_sortOL\updater\updater.ps1"

if (!(Test-Path $scriptPath)) {
    throw "Не найден updater.ps1: $scriptPath"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At 03:00

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Description "Проверка обновлений расширения bx24_sortOL" `
    -Force
