[CmdletBinding()]
param(
    [string]$SourcePath = (Get-Location).Path,
    [string]$InstallPath = 'C:\Bots\bot-stz-v1',
    [string]$Branch = 'codex/painel-auditoria-repasses'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repository = 'https://github.com/RaikySilvaDEV/bot-stz_v1.git'
$taskName = 'BotSTZ-AutoDeploy'
$configPath = 'C:\ProgramData\BotSTZ\deploy-config.json'
$scriptPath = Join-Path $InstallPath 'scripts\run-auto-deploy.ps1'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Copy-MissingTree([string]$From, [string]$To) {
    if (-not (Test-Path -LiteralPath $From -PathType Container)) { return }
    Get-ChildItem -LiteralPath $From -File -Recurse -Force | ForEach-Object {
        $relative = $_.FullName.Substring($From.TrimEnd('\').Length).TrimStart('\')
        $destination = Join-Path $To $relative
        if (-not (Test-Path -LiteralPath $destination)) {
            $destinationDirectory = Split-Path -Parent $destination
            New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $destination
        }
    }
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$Label) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label falhou (código $LASTEXITCODE)." }
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como Administrador e execute novamente.'
}

$SourcePath = [IO.Path]::GetFullPath($SourcePath)
$InstallPath = [IO.Path]::GetFullPath($InstallPath)
if (-not (Test-Path -LiteralPath (Join-Path $SourcePath 'package.json') -PathType Leaf)) {
    throw "Não encontrei package.json em $SourcePath. Passe a pasta antiga do bot em -SourcePath."
}
if (-not (Test-Path -LiteralPath (Join-Path $SourcePath '.env') -PathType Leaf)) {
    throw "Não encontrei .env em $SourcePath. Copie seu .env para a pasta do bot sem compartilhar o conteúdo."
}

$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    throw "A porta 3001 já está em uso pelo PID $($listener.OwningProcess). Pare a instância atual do bot com Ctrl+C antes de migrar, para evitar dois bots simultâneos."
}

$gitCommand = Get-Command git.exe -ErrorAction Stop
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop

Write-Step 'Preparando uma cópia Git limpa do projeto'
if (Test-Path -LiteralPath $InstallPath) {
    if (-not (Test-Path -LiteralPath (Join-Path $InstallPath '.git') -PathType Container)) {
        throw "$InstallPath já existe e não é um clone Git. Nada foi sobrescrito. Escolha outro -InstallPath ou mova essa pasta manualmente."
    }
    Invoke-Checked $gitCommand.Source @('-C', $InstallPath, 'fetch', 'origin', $Branch) 'git fetch'
    $localBranch = & $gitCommand.Source -C $InstallPath branch --list $Branch
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar as branches locais.' }
    if ($localBranch) {
        Invoke-Checked $gitCommand.Source @('-C', $InstallPath, 'checkout', $Branch) 'git checkout'
    } else {
        Invoke-Checked $gitCommand.Source @('-C', $InstallPath, 'checkout', '--track', '-b', $Branch, "origin/$Branch") 'git checkout da branch remota'
    }
    Invoke-Checked $gitCommand.Source @('-C', $InstallPath, 'pull', '--ff-only', 'origin', $Branch) 'git pull'
} else {
    New-Item -ItemType Directory -Path (Split-Path -Parent $InstallPath) -Force | Out-Null
    Invoke-Checked $gitCommand.Source @('clone', '--single-branch', '--branch', $Branch, $repository, $InstallPath) 'git clone'
}

Write-Step 'Preservando configuração e dados locais'
$targetEnv = Join-Path $InstallPath '.env'
if (-not (Test-Path -LiteralPath $targetEnv)) {
    Copy-Item -LiteralPath (Join-Path $SourcePath '.env') -Destination $targetEnv
}
foreach ($directory in @('data', 'ModArmazem', 'Wallpapers', 'assets')) {
    Copy-MissingTree (Join-Path $SourcePath $directory) (Join-Path $InstallPath $directory)
}
foreach ($legacyFile in @('wallpaper_state.json', 'mod_estoque_state.json', 'tickets_notificados.json', 'anuncios_fivem.json')) {
    $legacySource = Join-Path $SourcePath $legacyFile
    $legacyTarget = Join-Path $InstallPath $legacyFile
    if ((Test-Path -LiteralPath $legacySource -PathType Leaf) -and -not (Test-Path -LiteralPath $legacyTarget)) {
        Copy-Item -LiteralPath $legacySource -Destination $legacyTarget
    }
}

$tokenCheck = Get-Content -LiteralPath $targetEnv -Raw
if ($tokenCheck -notmatch '(?m)^\s*DISCORD_TOKEN\s*=\s*[^\s#]+') {
    throw 'O .env da cópia Git não contém DISCORD_TOKEN configurado. Não vou iniciar o bot.'
}

Write-Step 'Instalando cloudflared sem depender do PATH do usuário'
$toolsPath = Join-Path $InstallPath 'tools'
New-Item -ItemType Directory -Path $toolsPath -Force | Out-Null
$cloudflaredPath = Join-Path $toolsPath 'cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
    $release = Invoke-RestMethod -Headers @{ 'User-Agent' = 'BotSTZ-Windows-Setup' } -Uri 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest'
    $asset = $release.assets | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' } | Select-Object -First 1
    if (-not $asset) { throw 'Não encontrei o executável oficial cloudflared para Windows x64.' }
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $cloudflaredPath
    if ($asset.digest -match '^sha256:(.+)$') {
        $actualHash = (Get-FileHash -LiteralPath $cloudflaredPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $Matches[1].ToLowerInvariant()) {
            Remove-Item -LiteralPath $cloudflaredPath -Force
            throw 'A verificação SHA-256 do cloudflared falhou; o arquivo foi removido.'
        }
    }
}

Write-Step 'Instalando dependências do projeto'
Push-Location $InstallPath
try { Invoke-Checked $npmCommand.Source @('ci') 'npm ci' }
finally { Pop-Location }

Write-Step 'Configurando o atualizador periódico'
$configDirectory = Split-Path -Parent $configPath
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$config = [ordered]@{
    ProjectPath = $InstallPath
    Branch = $Branch
    GitPath = $gitCommand.Source
    NodePath = $nodeCommand.Source
    NpmPath = $npmCommand.Source
    CloudflaredPath = $cloudflaredPath
    LogPath = Join-Path $configDirectory 'logs'
    PollSeconds = 60
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$actionArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ConfigPath `"$configPath`""
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principalTask = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principalTask -Description 'Mantém o Bot STZ ativo e atualiza o branch Git configurado a cada minuto.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "`nConfiguração concluída." -ForegroundColor Green
Write-Host "Projeto: $InstallPath"
Write-Host "Branch acompanhado: $Branch"
Write-Host "Tarefa do Windows: $taskName (inicia no boot e verifica atualizações a cada 60 segundos)"
Write-Host "Logs: $configDirectory\logs"
Write-Host 'O bot e o cloudflared foram movidos para a tarefa do Windows; mantenha o computador ligado e sem suspensão.'
