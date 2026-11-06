[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ConfigPath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$project = [string]$config.ProjectPath
$branch = [string]$config.Branch
$logDirectory = [string]$config.LogPath
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$deployLog = Join-Path $logDirectory 'deploy.log'
$env:Path = "$(Split-Path -Parent $config.NodePath);$(Split-Path -Parent $config.GitPath);$(Split-Path -Parent $config.CloudflaredPath);$env:Path"

function Write-DeployLog([string]$Message) {
    Add-Content -LiteralPath $deployLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

function Start-BotProcess {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $logDirectory "bot-$stamp.log"
    $stderr = Join-Path $logDirectory "bot-$stamp-error.log"
    Write-DeployLog 'Iniciando supervisor do bot e Cloudflare Tunnel.'
    Start-Process -FilePath ([string]$config.NodePath) -ArgumentList 'src/process/supervisor.js' -WorkingDirectory $project -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}

function Stop-BotProcess($Process) {
    if (-not $Process) { return }
    $Process.Refresh()
    if ($Process.HasExited) { return }
    Write-DeployLog "Encerrando processo $($Process.Id) antes da atualização."
    & "$env:SystemRoot\System32\taskkill.exe" /PID $Process.Id /T /F *> $null
    $Process.WaitForExit(15000)
}

function Invoke-Git([string[]]$Arguments) {
    & ([string]$config.GitPath) -C $project @Arguments
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') falhou (código $LASTEXITCODE)." }
}

function Invoke-NpmCi {
    Push-Location $project
    try {
        & ([string]$config.NpmPath) ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci falhou (código $LASTEXITCODE)." }
    } finally { Pop-Location }
}

$bot = $null
try {
    Write-DeployLog "Atualizador iniciado. Branch monitorado: $branch."
    while ($true) {
        if (-not $bot) { $bot = Start-BotProcess }
        else {
            $bot.Refresh()
            if ($bot.HasExited) {
                Write-DeployLog "Supervisor encerrou com código $($bot.ExitCode); iniciando novamente."
                $bot = Start-BotProcess
            }
        }

        Start-Sleep -Seconds ([Math]::Max(30, [int]$config.PollSeconds))
        try {
            Invoke-Git @('fetch', '--quiet', 'origin', $branch)
            $current = (& ([string]$config.GitPath) -C $project rev-parse HEAD).Trim()
            $remote = (& ([string]$config.GitPath) -C $project rev-parse "origin/$branch").Trim()
            if ($LASTEXITCODE -ne 0) { throw 'Não foi possível ler os commits locais/remotos.' }
            if ($current -eq $remote) { continue }

            Write-DeployLog "Nova versão detectada ($current -> $remote); iniciando redeploy."
            $previousCommit = $current
            Stop-BotProcess $bot
            $bot = $null
            Invoke-Git @('pull', '--ff-only', 'origin', $branch)
            try {
                Invoke-NpmCi
            } catch {
                Write-DeployLog "Dependências falharam; voltando para $previousCommit. Motivo: $($_.Exception.Message)"
                Invoke-Git @('reset', '--hard', $previousCommit)
                Invoke-NpmCi
                throw
            }
            Write-DeployLog 'Atualização concluída; bot reiniciando na nova versão.'
            $bot = Start-BotProcess
        } catch {
            Write-DeployLog "Falha temporária na verificação/atualização: $($_.Exception.Message)"
            if (-not $bot) { $bot = Start-BotProcess }
        }
    }
} catch {
    Write-DeployLog "Atualizador encerrou: $($_.Exception.Message)"
    throw
} finally {
    Stop-BotProcess $bot
}
