<p align="center">
  <img src="assets/olheiro_trim.png" alt="Olheiro" width="420">
</p>

<p align="center">
  <strong>Local desktop assistant for screen capture, OCR, clipboard, scroll and AI-assisted study.</strong><br>
  <em>Assistente desktop local para recorte de tela, OCR, clipboard, scroll e estudo com IA.</em>
</p>

<p align="center">
  <a href="https://github.com/pedrotescaro/olheiro-desktop/releases/latest">
    <img alt="Release" src="https://img.shields.io/github/v/release/pedrotescaro/olheiro-desktop?style=for-the-badge&label=release">
  </a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%2B-0078D4?style=for-the-badge&logo=windows&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-24C8DB?style=for-the-badge&logo=tauri&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=111827">
  <img alt="Python" src="https://img.shields.io/badge/Python-OCR%20backend-3776AB?style=for-the-badge&logo=python&logoColor=white">
</p>

---

## Download

Download the latest version from the releases page:

[**Download Olheiro for Windows**](https://github.com/pedrotescaro/olheiro-desktop/releases/latest)

Main release files:

- `Olheiro_0.3.3_x64-setup.exe`: recommended installer for Windows.
- `Olheiro_0.3.3_x64_en-US.msi`: alternative MSI installer.

> The installer includes the Tauri app, React frontend, bundled Python backend and the resources needed for OCR when the build was generated with Tesseract installed.

## What is it

Olheiro is a local study assistant. It helps you crop part of your screen, extract text with OCR, copy text/image/prompt, open an AI of your choice, and paste the content under your control.

It does not automate course platforms, does not log in to accounts, does not save passwords, does not send messages automatically, and does not press Enter for you.

## Key features

- Screen capture with `Esc` to cancel.
- Saves to `captures/recorte_YYYYMMDD_HHMMSS.png`.
- Local OCR with Tesseract + image pre-processing (grayscale, upscale, contrast, binarization).
- Preview of the last capture.
- Editable OCR text before copy or paste.
- Editable default prompt saved locally.
- Copy OCR, prompt, image or prompt + image.
- Open Gemini, ChatGPT, Claude, Copilot, Perplexity and DeepSeek.
- Real AI provider icons, including DeepSeek from the official chat favicon.
- Optional auto-copy after capture.
- Optional auto-paste with delay, never sending Enter.
- Continuous local scroll up or down.
- Scroll blocked when mouse is over the Olheiro window.
- Fixed sidebar with collapse support for smaller windows.
- **Capture history persisted across sessions.**
- **Light / Dark / System theme.**
- **English and Portuguese interface.**
- **Option to reuse the active AI browser tab or open a new tab.**
- **Automatic update check via GitHub releases.**
- Preferences and captures saved locally.

## Interface

The interface is built with **TypeScript + React + Tailwind + Tauri**, following a visual identity based on the Olheiro logo: dark blue, cyan/teal and neutral tones.

It features:

- Collapsible sidebar (compact mode with icons only);
- Responsive layout that works from 420×340 up to any resolution;
- Light, dark, and system-matched theme;
- Language selector (Português / English);
- Organized cards;
- Modern switches;
- Visible status indicator;
- AI selection with icons;
- Persistent action history;
- Responsive layout for smaller and larger screens.

## Stack

| Layer | Technology |
| --- | --- |
| Desktop | Tauri 2 |
| Frontend | TypeScript, React, Tailwind, Vite |
| Backend | Python HTTP server |
| OCR | Tesseract + pytesseract + Pillow pre-processing |
| Clipboard / Image | pywin32 |
| Capture / Mouse | Tkinter, Pillow, pynput |
| Bundling | PyInstaller + Tauri bundle |
| Auto-update | tauri-plugin-updater + GitHub releases |

## Running in development

Requirements:

- Windows 10 or later.
- Python 3.12+.
- Node.js.
- Rust/Cargo.
- Tesseract OCR.

Install Rust:

```powershell
winget install -e --id Rustlang.Rustup
```

Install Tesseract:

```powershell
winget install UB-Mannheim.TesseractOCR
```

Run the app:

```powershell
.\run.bat
```

Debug mode:

```powershell
.\run.bat --debug
```

Web/backend stack only:

```powershell
npm run dev:stack
```

## Build installer

The script below prepares dependencies, packages the Python backend with PyInstaller, copies Tesseract to the bundle, and generates Tauri installers:

```powershell
.\build_exe.bat
```

Outputs:

- `src-tauri\target\release\bundle\nsis\Olheiro_0.3.3_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\Olheiro_0.3.3_x64_en-US.msi`
- `src-tauri\target\release\olheiro.exe`

### Code signing (optional)

Set the following environment variables before building to sign the installers:

```powershell
$env:OLHEIRO_SIGN_CERT = "path\to\certificate.pfx"
$env:OLHEIRO_SIGN_PASS = "certificate-password"
.\build_exe.bat
```

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+S` | Capture screen |
| `Ctrl+Shift+C` | Copy current OCR |
| `Ctrl+Shift+V` | Paste selected content |
| `Ctrl+Shift+Down` | Scroll down |
| `Ctrl+Shift+Up` | Scroll up |

## Structure

```text
assets/                  Logo, favicon and icons
backend_server.py        Local API used by frontend
config/                  Paths, providers and settings
models/                  Data models
services/                OCR, capture, clipboard, browser and scroll
src/                     React/Tailwind frontend
  i18n.ts                Internationalization (PT/EN)
  App.tsx                Main application component
  types.ts               TypeScript types
  styles.css             Theme-aware styles
src-tauri/               Tauri desktop shell
utils/                   Platform and image helpers
build_exe.bat            Full build for Windows
run.bat                  Development launcher
requirements.txt         Python dependencies
package.json             Node/Tauri scripts
```

## Privacy

Olheiro runs locally. It does not save credentials, cookies, tokens, or login data. Captures stay on the user's machine and the `captures/` folder is ignored by Git to avoid publishing personal screenshots.

Local preferences are stored in `settings.json` during development and in `%LOCALAPPDATA%\Olheiro` in the packaged app. Capture history is persisted in `history.json` in the same location.

## Responsible use

Use Olheiro to study and understand content. Respect course rules, platforms, exams and evaluations. The app is designed to keep the user in control: it copies, pastes and opens pages, but does not send answers and does not try to bypass any site's rules.

## Roadmap

- ~~Persist history across sessions.~~ ✅
- ~~Improve OCR with image pre-processing.~~ ✅
- ~~Create light/dark theme.~~ ✅
- ~~Add English and Portuguese interface.~~ ✅
- ~~Add reuse AI tab option.~~ ✅
- ~~Prepare code signing infrastructure.~~ ✅
- ~~Auto-update via GitHub releases.~~ ✅
- Add more AI providers.
- Support macOS and Linux.
- Global hotkey registration outside the app window.
