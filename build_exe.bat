@echo off
setlocal
cd /d "%~dp0"

set "PYTHON=python"
set "VENV_PY=.venv\Scripts\python.exe"
set "TESSERACT_SRC=C:\Program Files\Tesseract-OCR"
set "TESSERACT_VENDOR=vendor\tesseract"
set "CARGO_BIN=%USERPROFILE%\.cargo\bin"

if not exist "%VENV_PY%" (
  echo [Olheiro] Criando ambiente virtual Python...
  %PYTHON% -m venv .venv
  if errorlevel 1 exit /b 1
)

echo [Olheiro] Instalando dependencias Python...
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

if not exist "node_modules" (
  echo [Olheiro] Instalando dependencias Node...
  cmd /c npm install
  if errorlevel 1 exit /b 1
)

if not exist "%CARGO_BIN%\cargo.exe" (
  echo Rust/Cargo nao encontrado. Instale com:
  echo winget install -e --id Rustlang.Rustup
  pause
  exit /b 1
)

if exist "%TESSERACT_SRC%\tesseract.exe" (
  echo [Olheiro] Copiando Tesseract para bundle portatil...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path '%TESSERACT_VENDOR%' | Out-Null; Copy-Item -LiteralPath '%TESSERACT_SRC%\*' -Destination '%TESSERACT_VENDOR%' -Recurse -Force"
) else (
  echo.
  echo [Olheiro] Tesseract nao encontrado em %TESSERACT_SRC%.
  echo Para gerar um instalador portatil com OCR, instale antes:
  echo winget install UB-Mannheim.TesseractOCR
  pause
  exit /b 1
)

echo [Olheiro] Gerando backend portatil...
"%VENV_PY%" -m PyInstaller --noconfirm --clean --noconsole --onefile --name olheiro-backend --hidden-import win32clipboard --hidden-import win32con --hidden-import pywintypes --add-data "assets;assets" --add-data "vendor\tesseract;tesseract" backend_server.py
if errorlevel 1 exit /b 1

echo [Olheiro] Copiando backend para recursos Tauri...
mkdir "src-tauri\resources" 2>nul
copy /Y "dist\olheiro-backend.exe" "src-tauri\resources\olheiro-backend.exe" >nul
if errorlevel 1 exit /b 1

echo [Olheiro] Gerando app Tauri...
set "PATH=%CARGO_BIN%;%PATH%"
cmd /c npm run tauri -- build
if errorlevel 1 exit /b 1

echo.
echo [Olheiro] Build finalizado.
echo Instalador EXE:
echo src-tauri\target\release\bundle\nsis\Olheiro_0.2.0_x64-setup.exe
echo.
echo Instalador MSI:
echo src-tauri\target\release\bundle\msi\Olheiro_0.2.0_x64_en-US.msi
echo.
echo Executavel de release para teste local:
echo src-tauri\target\release\olheiro.exe
pause
