<p align="center">
  <img src="assets/olheiro_trim.png" alt="Olheiro" width="420">
</p>

<p align="center">
  <strong>Assistente desktop local para recorte de tela, OCR, clipboard, scroll e estudo com IA.</strong>
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

Baixe a versao mais recente pela pagina de releases:

[**Download do Olheiro para Windows**](https://github.com/pedrotescaro/olheiro-desktop/releases/latest)

Arquivos principais da release:

- `Olheiro_0.2.1_x64-setup.exe`: instalador recomendado para Windows.
- `Olheiro_0.2.1_x64_en-US.msi`: instalador MSI alternativo.

> O instalador inclui o app Tauri, o frontend React, o backend Python empacotado e os recursos necessarios para OCR quando o build foi gerado com Tesseract instalado.

## O que e

Olheiro e um assistente local de estudo. Ele ajuda a recortar uma parte da tela, extrair texto com OCR, copiar texto/imagem/prompt, abrir uma IA escolhida e colar o conteudo com controle do usuario.

Ele nao automatiza plataformas de curso, nao faz login em contas, nao salva senhas, nao envia mensagens automaticamente e nao pressiona Enter por voce.

## Principais recursos

- Recorte de tela com cancelamento por `Esc`.
- Salvamento em `captures/recorte_YYYYMMDD_HHMMSS.png`.
- OCR local com Tesseract.
- Preview do ultimo recorte.
- Texto OCR editavel antes de copiar ou colar.
- Prompt padrao editavel e salvo localmente.
- Copia de OCR, prompt, imagem ou prompt + imagem.
- Abertura de Gemini, ChatGPT, Claude, Copilot e Perplexity.
- Icones reais das IAs.
- Auto-copia opcional apos recorte.
- Auto-colagem opcional com delay, sempre sem enviar Enter.
- Scroll continuo local para cima ou para baixo.
- Scroll bloqueado quando o mouse esta sobre a janela do Olheiro.
- Sidebar fixa para manter o botao de parar scroll sempre acessivel.
- Historico dos ultimos recortes da sessao.
- Preferencias e capturas salvas localmente.

## Interface

A interface foi reconstruida com **TypeScript + React + Tailwind + Tauri**, seguindo uma identidade visual baseada no logo Olheiro: azul escuro, ciano/teal e tons neutros.

Ela usa:

- sidebar fixa;
- cards organizados;
- switches modernos;
- status visivel;
- selecao de IA com icones;
- historico de acoes;
- layout responsivo para telas menores e maiores.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Desktop | Tauri 2 |
| Frontend | TypeScript, React, Tailwind, Vite |
| Backend local | Python HTTP server |
| OCR | Tesseract + pytesseract |
| Clipboard / imagem | pywin32 |
| Captura / mouse | Tkinter, Pillow, pynput |
| Empacotamento | PyInstaller + Tauri bundle |

## Como rodar em desenvolvimento

Requisitos:

- Windows 10 ou superior.
- Python 3.12+.
- Node.js.
- Rust/Cargo.
- Tesseract OCR.

Instale Rust:

```powershell
winget install -e --id Rustlang.Rustup
```

Instale Tesseract:

```powershell
winget install UB-Mannheim.TesseractOCR
```

Rode o app:

```powershell
.\run.bat
```

Modo debug:

```powershell
.\run.bat --debug
```

Somente stack web/backend:

```powershell
npm run dev:stack
```

## Gerar instalador

O script abaixo prepara dependencias, empacota o backend Python com PyInstaller, copia o Tesseract para o bundle e gera os instaladores Tauri:

```powershell
.\build_exe.bat
```

Saidas:

- `src-tauri\target\release\bundle\nsis\Olheiro_0.2.1_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\Olheiro_0.2.1_x64_en-US.msi`
- `src-tauri\target\release\olheiro.exe`

## Atalhos

| Atalho | Acao |
| --- | --- |
| `Ctrl+Shift+S` | Recortar tela |
| `Ctrl+Shift+C` | Copiar OCR atual |
| `Ctrl+Shift+V` | Colar conteudo escolhido |
| `Ctrl+Shift+Down` | Scroll para baixo |
| `Ctrl+Shift+Up` | Scroll para cima |

## Estrutura

```text
assets/                  Logo, favicon e icones
backend_server.py         API local usada pelo frontend
config/                   Caminhos, providers e preferencias
models/                   Modelos de dados
services/                 OCR, captura, clipboard, browser e scroll
src/                      Frontend React/Tailwind
src-tauri/                Shell desktop Tauri
utils/                    Helpers de plataforma e imagem
build_exe.bat             Build completo para Windows
run.bat                   Launcher de desenvolvimento
requirements.txt          Dependencias Python
package.json              Scripts Node/Tauri
```

## Privacidade

O Olheiro roda localmente. Ele nao salva credenciais, cookies, tokens ou dados de login. As capturas ficam na maquina do usuario e a pasta `captures/` e ignorada pelo Git para evitar publicar prints pessoais.

Preferencias locais ficam em `settings.json` durante desenvolvimento e em `%LOCALAPPDATA%\Olheiro` no app empacotado.

## Uso responsavel

Use o Olheiro para estudar e entender conteudos. Respeite regras de cursos, plataformas, provas e avaliacoes. O app foi desenhado para manter o usuario no controle: ele copia, cola e abre paginas, mas nao envia respostas e nao tenta burlar regras de nenhum site.

## Roadmap

- Persistir historico entre sessoes.
- Melhorar OCR com pre-processamento de imagem.
- Criar tema claro/escuro.
- Adicionar assinatura de codigo para reduzir alertas do Windows.
- Criar atualizacao automatica via releases.
