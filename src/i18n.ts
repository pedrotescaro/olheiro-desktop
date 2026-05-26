import { useCallback, useMemo } from "react";

type Locale = "pt" | "en";

const translations: Record<Locale, Record<string, string>> = {
  pt: {
    // Sidebar
    "sidebar.subtitle": "Assistente local de estudo",
    "sidebar.capture": "Recortar tela",
    "sidebar.sendChatGPT": "Enviar para IA",
    "sidebar.pasteNow": "Colar agora",
    "sidebar.stopScroll": "Parar scroll",
    "sidebar.userControl": "Controle do usuário",
    "sidebar.userControlDesc":
      "O app copia, cola e abre páginas, mas não envia Enter nem automatiza sites de curso.",

    // Status
    "status.connecting": "Conectando backend",
    "status.ready": "Pronto",
    "status.offline": "Backend offline",
    "status.waitingCrop": "Aguardando recorte",
    "status.ocrDone": "OCR concluído",
    "status.cropCancelled": "Recorte cancelado",
    "status.cropError": "Erro ao recortar",
    "status.noCapture": "Nenhum recorte pronto",
    "status.copied": "Copiado",
    "status.ctrlVSent": "Ctrl+V enviado sem Enter",
    "status.settingsError": "Falha ao salvar preferências",
    "status.historyCopied": "Texto do histórico copiado",
    "status.imageOpened": "Imagem aberta",
    "status.scrollDown": "Scroll para baixo ativo",
    "status.scrollUp": "Scroll para cima ativo",
    "status.scrollStopped": "Scroll parado",
    "status.openedAi": "aberto",
    "status.openAiFail": "Falha ao abrir IA",
    "status.unknownError": "Erro desconhecido",

    // Cards
    "card.aiConfig": "Configuração da IA",
    "card.aiConfigSub": "Escolha destino, conteúdo, prompt e automações locais.",
    "card.quickActions": "Ações rápidas",
    "card.quickActionsSub": "Comandos principais e atalhos de trabalho.",
    "card.history": "Histórico de recortes",
    "card.historySub": "Últimos recortes salvos.",
    "card.lastCapture": "Último recorte e OCR",
    "card.lastCaptureSub": "Revise o texto antes de copiar ou colar.",
    "card.systemStatus": "Status do sistema",
    "card.systemStatusSub": "Diagnóstico rápido do app local.",
    "card.log": "Log",
    "card.logSub": "Eventos recentes.",

    // Labels
    "label.ai": "IA",
    "label.content": "Conteúdo",
    "label.openAi": "Abrir IA",
    "label.delay": "Delay",
    "label.scrollSpeed": "Velocidade do scroll",
    "label.defaultPrompt": "Prompt padrão",
    "label.theme": "Tema",
    "label.language": "Idioma",

    // Switches
    "switch.openAfterCapture": "Abrir IA após recorte",
    "switch.copyAfterCapture": "Copiar após recorte",
    "switch.pasteAfterDelay": "Colar após delay",
    "switch.saveCaptures": "Salvar prints",
    "switch.reuseAiTab": "Reutilizar guia da IA",

    // Buttons
    "btn.capture": "Recortar tela",
    "btn.copyOcr": "Copiar OCR",
    "btn.pasteNow": "Colar agora",
    "btn.scrollDown": "Scroll baixo",
    "btn.scrollUp": "Scroll cima",
    "btn.stopScroll": "Parar scroll",
    "btn.copyPrompt": "Copiar prompt",
    "btn.copyImage": "Copiar imagem",
    "btn.openImage": "Abrir imagem",

    // Theme options
    "theme.light": "Claro",
    "theme.dark": "Escuro",
    "theme.system": "Sistema",

    // Misc
    "misc.noCapture": "Nenhum recorte ainda",
    "misc.useCaptureToStart": "Use Recortar tela para iniciar.",
    "misc.ocrPlaceholder": "Texto OCR aparece aqui.",
    "misc.previewPlaceholder": "Preview do recorte",
    "misc.noHistory": "Nenhum recorte salvo ainda.",
    "misc.noLog": "Nenhum evento ainda.",
    "misc.subtitle": "Recorte, OCR, cópia e colagem controlada para estudo.",

    // System metrics
    "metric.ocr": "OCR",
    "metric.scroll": "Scroll",
    "metric.backend": "Backend",
    "metric.captures": "Captures",
    "metric.connecting": "Conectando",
    "metric.stopped": "Parado",
    "metric.offline": "Offline",
    "metric.unavailable": "Indisponível",

    // Update
    "update.available": "Nova versão disponível!",
    "update.download": "Atualizar",
    "update.checking": "Verificando atualizações...",
    "update.upToDate": "Versão atualizada",
    "update.error": "Erro ao verificar atualizações",
  },
  en: {
    // Sidebar
    "sidebar.subtitle": "Local study assistant",
    "sidebar.capture": "Capture screen",
    "sidebar.sendChatGPT": "Send to AI",
    "sidebar.pasteNow": "Paste now",
    "sidebar.stopScroll": "Stop scroll",
    "sidebar.userControl": "User control",
    "sidebar.userControlDesc":
      "The app copies, pastes and opens pages, but does not send Enter or automate course sites.",

    // Status
    "status.connecting": "Connecting backend",
    "status.ready": "Ready",
    "status.offline": "Backend offline",
    "status.waitingCrop": "Waiting for selection",
    "status.ocrDone": "OCR complete",
    "status.cropCancelled": "Selection cancelled",
    "status.cropError": "Capture error",
    "status.noCapture": "No capture ready",
    "status.copied": "Copied",
    "status.ctrlVSent": "Ctrl+V sent without Enter",
    "status.settingsError": "Failed to save settings",
    "status.historyCopied": "History text copied",
    "status.imageOpened": "Image opened",
    "status.scrollDown": "Scrolling down",
    "status.scrollUp": "Scrolling up",
    "status.scrollStopped": "Scroll stopped",
    "status.openedAi": "opened",
    "status.openAiFail": "Failed to open AI",
    "status.unknownError": "Unknown error",

    // Cards
    "card.aiConfig": "AI Configuration",
    "card.aiConfigSub": "Choose destination, content, prompt and local automations.",
    "card.quickActions": "Quick actions",
    "card.quickActionsSub": "Main commands and keyboard shortcuts.",
    "card.history": "Capture history",
    "card.historySub": "Last saved captures.",
    "card.lastCapture": "Last capture & OCR",
    "card.lastCaptureSub": "Review text before copying or pasting.",
    "card.systemStatus": "System status",
    "card.systemStatusSub": "Quick local app diagnostics.",
    "card.log": "Log",
    "card.logSub": "Recent events.",

    // Labels
    "label.ai": "AI",
    "label.content": "Content",
    "label.openAi": "Open AI",
    "label.delay": "Delay",
    "label.scrollSpeed": "Scroll speed",
    "label.defaultPrompt": "Default prompt",
    "label.theme": "Theme",
    "label.language": "Language",

    // Switches
    "switch.openAfterCapture": "Open AI after capture",
    "switch.copyAfterCapture": "Copy after capture",
    "switch.pasteAfterDelay": "Paste after delay",
    "switch.saveCaptures": "Save screenshots",
    "switch.reuseAiTab": "Reuse AI tab",

    // Buttons
    "btn.capture": "Capture screen",
    "btn.copyOcr": "Copy OCR",
    "btn.pasteNow": "Paste now",
    "btn.scrollDown": "Scroll down",
    "btn.scrollUp": "Scroll up",
    "btn.stopScroll": "Stop scroll",
    "btn.copyPrompt": "Copy prompt",
    "btn.copyImage": "Copy image",
    "btn.openImage": "Open image",

    // Theme options
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.system": "System",

    // Misc
    "misc.noCapture": "No capture yet",
    "misc.useCaptureToStart": "Use Capture screen to start.",
    "misc.ocrPlaceholder": "OCR text appears here.",
    "misc.previewPlaceholder": "Capture preview",
    "misc.noHistory": "No captures saved yet.",
    "misc.noLog": "No events yet.",
    "misc.subtitle": "Screen capture, OCR, copy and controlled paste for studying.",

    // System metrics
    "metric.ocr": "OCR",
    "metric.scroll": "Scroll",
    "metric.backend": "Backend",
    "metric.captures": "Captures",
    "metric.connecting": "Connecting",
    "metric.stopped": "Stopped",
    "metric.offline": "Offline",
    "metric.unavailable": "Unavailable",

    // Update
    "update.available": "New version available!",
    "update.download": "Update",
    "update.checking": "Checking for updates...",
    "update.upToDate": "Up to date",
    "update.error": "Error checking for updates",
  },
};

export type { Locale };

export function useI18n(locale: Locale) {
  const t = useCallback(
    (key: string, replacements?: Record<string, string>): string => {
      let text = translations[locale]?.[key] ?? translations.pt[key] ?? key;
      if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
          text = text.replace(`{${k}}`, v);
        }
      }
      return text;
    },
    [locale],
  );

  const localeLabel = useMemo(() => (locale === "pt" ? "Português" : "English"), [locale]);

  return { t, locale, localeLabel };
}
