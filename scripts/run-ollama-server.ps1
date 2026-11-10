[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ConfigPath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$logDirectory = [string]$config.LogPath
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'ollama-autostart.log'
$stdoutPath = Join-Path $logDirectory 'ollama-server.out.log'
$stderrPath = Join-Path $logDirectory 'ollama-server.err.log'
$ollamaPath = [IO.Path]::GetFullPath([string]$config.OllamaPath)
$modelPath = [IO.Path]::GetFullPath([string]$config.ModelsPath)

function Write-OllamaLog([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Test-OllamaApi {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 -UseBasicParsing
        return [int]$response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $ollamaPath -PathType Leaf)) {
    throw "Executável do Ollama não encontrado: $ollamaPath"
}
if (-not (Test-Path -LiteralPath $modelPath -PathType Container)) {
    throw "Pasta dos modelos do Ollama não encontrada: $modelPath"
}

$env:OLLAMA_MODELS = $modelPath
$env:OLLAMA_HOST = '127.0.0.1:11434'
Write-OllamaLog "Supervisor do Ollama iniciado. Modelos: $modelPath"

while ($true) {
    if (Test-OllamaApi) {
        Start-Sleep -Seconds 10
        continue
    }

    try {
        $process = Start-Process -FilePath $ollamaPath -ArgumentList @('serve') -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        Write-OllamaLog "Servidor Ollama iniciado (PID $($process.Id)); aguardando API local."
    } catch {
        Write-OllamaLog "Falha ao iniciar o Ollama: $($_.Exception.Message)"
        Start-Sleep -Seconds 30
        continue
    }

    $deadline = (Get-Date).AddMinutes(5)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if (Test-OllamaApi) { $ready = $true; break }
        $process.Refresh()
        if ($process.HasExited) { break }
        Start-Sleep -Seconds 5
    }

    if ($ready) {
        Write-OllamaLog 'API Ollama pronta em http://127.0.0.1:11434.'
        $process.WaitForExit()
        Write-OllamaLog "Servidor Ollama encerrou (código $($process.ExitCode)); reiniciando em 10 segundos."
        Start-Sleep -Seconds 10
        continue
    }

    $process.Refresh()
    if (-not $process.HasExited) {
        Write-OllamaLog 'O Ollama não abriu a API em cinco minutos; encerrando essa tentativa para reiniciar.'
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        $process.WaitForExit()
    } else {
        Write-OllamaLog "Ollama encerrou antes de abrir a API (código $($process.ExitCode)); nova tentativa em 30 segundos."
    }
    Start-Sleep -Seconds 30
}
