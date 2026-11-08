@echo off
setlocal
title Recuperar BotSTZ

set "RECOVERY_SCRIPT=%~dp0scripts\recover-auto-deploy.ps1"
set "CONFIG_FILE=C:\ProgramData\BotSTZ\deploy-config.json"

if not exist "%RECOVERY_SCRIPT%" (
    echo ERRO: script de recuperacao nao encontrado:
    echo %RECOVERY_SCRIPT%
    pause
    exit /b 1
)

if not exist "%CONFIG_FILE%" (
    echo ERRO: configuracao do deploy nao encontrada:
    echo %CONFIG_FILE%
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RECOVERY_SCRIPT%" -ConfigPath "%CONFIG_FILE%"
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" echo A recuperacao falhou. Leia a mensagem acima.
pause
exit /b %RESULT%