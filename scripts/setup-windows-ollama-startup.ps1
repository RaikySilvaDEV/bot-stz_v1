[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\ProgramData\BotSTZ\deploy-config.json',
    [string]$TaskName = 'BotSTZ-Ollama'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como Administrador para criar a tarefa de inicialização do Ollama.'
}
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "Configuração do bot não encontrada: $ConfigPath"
}

$deploy = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$project = [IO.Path]::GetFullPath([string]$deploy.ProjectPath)
$runner = Join-Path $project 'scripts\run-ollama-server.ps1'
$envFile = Join-Path $project '.env'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Supervisor do Ollama não encontrado: $runner" }
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw "Arquivo .env não encontrado: $envFile" }

$ollamaCommand = Get-Command ollama.exe -ErrorAction SilentlyContinue
$ollamaPath = if ($ollamaCommand) { $ollamaCommand.Source } else { $null }
if (-not $ollamaPath) {
    $candidates = @('C:\Program Files\Ollama\ollama.exe', 'C:\Program Files (x86)\Ollama\ollama.exe')
    $profiles = Get-ChildItem -LiteralPath 'C:\Users' -Directory -ErrorAction SilentlyContinue
    foreach ($profile in $profiles) {
        $candidates += Join-Path $profile.FullName 'AppData\Local\Programs\Ollama\ollama.exe'
    }
    $ollamaPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $ollamaPath) { throw 'Não encontrei ollama.exe. Instale o Ollama e execute este comando novamente.' }

$userModelsPath = [Environment]::GetEnvironmentVariable('OLLAMA_MODELS', 'User')
$machineModelsPath = [Environment]::GetEnvironmentVariable('OLLAMA_MODELS', 'Machine')
$configuredModelsPath = if (-not [string]::IsNullOrWhiteSpace($userModelsPath)) { $userModelsPath } else { $machineModelsPath }
$modelsPath = if (-not [string]::IsNullOrWhiteSpace($configuredModelsPath)) {
    [Environment]::ExpandEnvironmentVariables($configuredModelsPath)
} else {
    Join-Path $env:USERPROFILE '.ollama\models'
}
if (-not (Test-Path -LiteralPath $modelsPath -PathType Container)) {
    throw "Não encontrei os modelos do usuário em $modelsPath. Execute este script na conta que já tem o modelo Ollama baixado."
}

$envLines = [IO.File]::ReadAllLines($envFile)
$ollamaHostLine = $envLines | Where-Object { $_ -match '^\s*OLLAMA_HOST\s*=' } | Select-Object -First 1
if ($ollamaHostLine -match '^\s*OLLAMA_HOST\s*=\s*["'']?(.*?)["'']?\s*$') {
    $hostValue = $Matches[1].Trim()
    if ($hostValue -and $hostValue -notmatch '^(https?://)?(127\.0\.0\.1|localhost)(:11434)?/?$') {
        throw 'OLLAMA_HOST no .env deve apontar somente para localhost ou 127.0.0.1 na porta 11434.'
    }
}

$modelList = & $ollamaPath list 2>&1
if ($LASTEXITCODE -ne 0) { throw "Não consegui ler os modelos instalados: $($modelList -join ' ')" }
$configuredModel = ($envLines | Where-Object { $_ -match '^\s*OLLAMA_MODEL\s*=' } | Select-Object -First 1) -replace '^\s*OLLAMA_MODEL\s*=\s*', ''
if ($configuredModel -and -not ($modelList -match [regex]::Escape($configuredModel))) {
    throw "O modelo configurado ($configuredModel) não aparece em 'ollama list'. Baixe-o antes de continuar."
}

$programDataDirectory = Split-Path -Parent $ConfigPath
$logDirectory = Join-Path $programDataDirectory 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$ollamaConfigPath = Join-Path $programDataDirectory 'ollama-config.json'
[ordered]@{ OllamaPath = $ollamaPath; ModelsPath = $modelsPath; LogPath = $logDirectory } |
    ConvertTo-Json | Set-Content -LiteralPath $ollamaConfigPath -Encoding UTF8

$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -ConfigPath `"$ollamaConfigPath`""
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principalTask = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principalTask -Description 'Inicia e supervisiona a IA local Ollama no boot do Windows.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Tarefa $TaskName criada e iniciada." -ForegroundColor Green
Write-Host "Executável: $ollamaPath"
Write-Host "Modelos: $modelsPath"
Write-Host "Log: $(Join-Path $logDirectory 'ollama-autostart.log')"
