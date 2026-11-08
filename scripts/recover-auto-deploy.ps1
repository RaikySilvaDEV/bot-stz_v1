[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\ProgramData\BotSTZ\deploy-config.json',
    [int]$StartupGraceSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$taskName = 'BotSTZ-AutoDeploy'
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Configuração do deploy não encontrada: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$project = [System.IO.Path]::GetFullPath([string]$config.ProjectPath)
$updaterPath = [System.IO.Path]::GetFullPath((Join-Path $project 'scripts\run-auto-deploy.ps1'))
$cloudflaredPath = [System.IO.Path]::GetFullPath([string]$config.CloudflaredPath)
$apiPort = 3001
$namedTunnelConfigured = $false
$envFile = Join-Path $project '.env'
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
        if ($line -match '^\s*API_PORT\s*=\s*(\d+)\s*$') {
            $apiPort = [int]$Matches[1]
        } elseif ($line -match '^\s*CLOUDFLARE_TUNNEL_TOKEN\s*=\s*(.*?)\s*$') {
            $namedTunnelConfigured = -not [string]::IsNullOrWhiteSpace($Matches[1])
        }
    }
}

function Get-BotProcessSnapshot {
    $processes = @(Get-CimInstance Win32_Process)
    $updaterPattern = [regex]::Escape($updaterPath)
    $tunnelPattern = "127\.0\.0\.1:$apiPort"
    if ($namedTunnelConfigured) { $tunnelPattern += '|(?:^|\s)tunnel\s+run(?:\s|$)' }
    $cloudflaredFullPath = [System.IO.Path]::GetFullPath($cloudflaredPath)
    $updaters = @($processes | Where-Object {
        $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -match $updaterPattern
    })
    $supervisors = @($processes | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src[\\/]process[\\/]supervisor\.js'
    })
    $botWorkers = @($processes | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -match '(^|\s|[\\/])index\.js(?:\s|$)'
    })
    $tunnels = @($processes | Where-Object {
        $_.Name -eq 'cloudflared.exe' -and
        $_.ExecutablePath -and
        [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $cloudflaredFullPath -and
        $_.CommandLine -match $tunnelPattern
    })
    $listener = @(Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue)
    return [pscustomobject]@{
        Processes = $processes
        Updaters = $updaters
        Supervisors = $supervisors
        BotWorkers = $botWorkers
        Tunnels = $tunnels
        ApiListening = ($listener.Count -gt 0)
    }
}

function Get-ProcessTreeIds($Processes, [int[]]$RootIds) {
    $allIds = [System.Collections.Generic.List[int]]::new()
    $frontier = @($RootIds | Select-Object -Unique)
    while ($frontier.Count -gt 0) {
        $children = @($Processes | Where-Object {
            $frontier -contains [int]$_.ParentProcessId -and $allIds -notcontains [int]$_.ProcessId
        })
        $frontier = @($children | ForEach-Object {
            $processId = [int]$_.ProcessId
            $allIds.Add($processId)
            $processId
        })
    }
    return @($allIds.ToArray())
}

function Stop-ProcessTree([int]$ProcessId) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    $taskkill = Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" `
        -ArgumentList @('/PID', $ProcessId, '/T', '/F') -PassThru -Wait -WindowStyle Hidden
    if ($taskkill.ExitCode -ne 0 -and -not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    if ($taskkill.ExitCode -ne 0) {
        throw "Não foi possível encerrar o processo BotSTZ $ProcessId."
    }
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if (-not $task.Settings.Enabled) {
    throw "A tarefa $taskName está desativada. Ative-a no Agendador de Tarefas."
}

$snapshot = Get-BotProcessSnapshot
$healthy = $task.State -eq 'Running' -and
    $snapshot.Updaters.Count -eq 1 -and
    $snapshot.Supervisors.Count -eq 1 -and
    $snapshot.BotWorkers.Count -eq 1 -and
    $snapshot.Tunnels.Count -eq 1 -and
    $snapshot.ApiListening

if ($healthy) {
    Write-Host 'Bot, túnel e API já estão ativos. Nenhuma nova instância foi iniciada.' -ForegroundColor Green
    exit 0
}

if ($task.State -eq 'Running' -and $snapshot.Updaters.Count -eq 1) {
    $startedAt = $snapshot.Updaters[0].CreationDate
    if ($startedAt -and ((Get-Date) - $startedAt).TotalSeconds -lt $StartupGraceSeconds) {
        Write-Host "O bot ainda está iniciando. Aguarde até $StartupGraceSeconds segundos após a abertura do terminal e confira novamente." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host 'Bot incompleto ou tarefa parada. Reiniciando a tarefa BotSTZ-AutoDeploy...' -ForegroundColor Yellow
$updaterIds = @($snapshot.Updaters | ForEach-Object { [int]$_.ProcessId })
$supervisorIds = @($snapshot.Supervisors | ForEach-Object { [int]$_.ProcessId })
$rootIds = @($updaterIds) + @($supervisorIds)
$descendantIds = Get-ProcessTreeIds $snapshot.Processes $rootIds

if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
}

foreach ($processId in @($updaterIds | Select-Object -Unique)) {
    Stop-ProcessTree ([int]$processId)
}
foreach ($processId in @($supervisorIds | Select-Object -Unique)) {
    Stop-ProcessTree ([int]$processId)
}
foreach ($processId in $descendantIds) {
    Stop-ProcessTree ([int]$processId)
}

$remaining = Get-BotProcessSnapshot
if ($remaining.Updaters.Count -gt 0 -or $remaining.Supervisors.Count -gt 0 -or
    $remaining.BotWorkers.Count -gt 0 -or $remaining.Tunnels.Count -gt 0) {
    throw 'Ainda há processos BotSTZ ativos. Nenhuma nova instância foi iniciada para evitar duplicação.'
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq 'Running') {
    throw 'O Agendador ainda informa a tarefa como Running. Nenhuma nova instância foi iniciada.'
}

Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Host 'Recuperação solicitada. A janela PowerShell do bot deve abrir em alguns segundos.' -ForegroundColor Green