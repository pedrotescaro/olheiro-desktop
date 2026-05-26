@echo off
setlocal
cd /d "%~dp0"

set "PYTHON=python"
set "VENV_PY=.venv\Scripts\python.exe"
set "CARGO_BIN=%USERPROFILE%\.cargo\bin"

if not exist "%VENV_PY%" (
  echo [Olheiro] Criando ambiente virtual Python...
  %PYTHON% -m venv .venv
  if errorlevel 1 (
    echo.
    echo Nao foi possivel criar o ambiente virtual.
    echo Confirme se o Python esta instalado e disponivel no PATH.
    pause
    exit /b 1
  )
)

echo [Olheiro] Verificando dependencias Python...
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Falha ao instalar dependencias Python.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [Olheiro] Instalando dependencias Node...
  cmd /c npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar dependencias Node.
    pause
    exit /b 1
  )
)

if not exist "%CARGO_BIN%\cargo.exe" (
  echo.
  echo Rust/Cargo nao encontrado. Instale com:
  echo winget install -e --id Rustlang.Rustup
  pause
  exit /b 1
)

set "PATH=%CARGO_BIN%;%PATH%"

if /I "%~1"=="--debug" (
  cmd /c npm run tauri dev
) else (
  echo [Olheiro] Abrindo app Tauri...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run tauri dev > tauri-dev.log 2>&1' -WorkingDirectory '%CD%' -WindowStyle Hidden"
)
