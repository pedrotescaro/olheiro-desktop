import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Menu,
  Moon,
  MousePointer2,
  PanelTop,
  Play,
  RefreshCw,
  ScrollText,
  Send,
  Shield,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, api } from "./api";
import { useI18n, type Locale } from "./i18n";
import type { BackendState, Capture, CourseContext, CourseState, Provider, Settings } from "./types";

const pasteModes = ["Texto OCR", "Imagem", "Prompt", "Prompt + imagem"];
const ocrLanguages = ["por+eng", "por", "eng", "spa", "eng+por"];
const ocrModes = ["balanced", "high_contrast", "raw"];
const retentionOptions = ["0", "1", "7", "15", "30", "90"];
const contentTypeOptions = ["texto", "video", "atividade", "quiz_estudo", "recurso"];
const statusOptions = ["nao_iniciado", "em_andamento", "revisado", "concluido"];
const coursePromptOrder = [
  "text_lesson",
  "video",
  "activity",
  "quick_review",
  "executive_summary",
  "glossary",
  "step_by_step",
  "review_questions",
  "flashcards",
  "video_checklist",
];

const contentTypeLabels: Record<string, string> = {
  texto: "Aula em texto",
  video: "Videoaula",
  atividade: "Atividade",
  quiz_estudo: "Quiz de estudo",
  recurso: "Recurso",
};

const statusLabels: Record<string, string> = {
  nao_iniciado: "Nao iniciado",
  em_andamento: "Em andamento",
  revisado: "Revisado",
  concluido: "Concluido",
};

const studyProfiles = [
  {
    name: "Geral",
    provider: "Gemini",
    prompt:
      "Estou estudando este conteudo. Explique em portugues, passo a passo, os conceitos principais do recorte. Se parecer questao de avaliacao, nao responda apenas com a alternativa final: me ajude a entender o raciocinio.",
  },
  {
    name: "Cisco",
    provider: "ChatGPT",
    prompt:
      "Estou estudando redes/Cisco. Explique os conceitos do recorte em portugues, destaque comandos, protocolos, camadas OSI/TCP-IP e o raciocinio. Se parecer avaliacao, ajude a entender sem dar apenas a alternativa final.",
  },
  {
    name: "Redes",
    provider: "Gemini",
    prompt:
      "Explique este conteudo de redes em portugues com exemplos praticos, termos importantes, possiveis pegadinhas e um resumo final para revisao.",
  },
  {
    name: "Ingles",
    provider: "Claude",
    prompt:
      "Use este recorte para me ajudar a estudar ingles. Explique vocabulario, gramatica, contexto e crie exemplos curtos em portugues e ingles.",
  },
  {
    name: "Programacao",
    provider: "ChatGPT",
    prompt:
      "Analise este recorte de programacao. Explique o codigo ou conceito passo a passo, indique erros comuns e mostre um exemplo pequeno quando ajudar.",
  },
  {
    name: "Matematica",
    provider: "Gemini",
    prompt:
      "Explique este conteudo de matematica em portugues, passo a passo, com formulas, intuicao e verificacao do resultado. Se parecer avaliacao, foque no raciocinio.",
  },
];

const fallbackSettings: Settings = {
  ai_provider: "Gemini",
  study_profile: "Geral",
  paste_mode: "Texto OCR",
  paste_delay_seconds: 5,
  auto_open_after_capture: true,
  auto_copy_after_capture: true,
  auto_paste_after_delay: false,
  save_captures: true,
  save_course_notes_auto: true,
  courses_dir: "",
  prompt_template:
    "Estou estudando este conteúdo. Explique em português, passo a passo, os conceitos principais do recorte. Se parecer questao de avaliação, não responda apenas com a alternativa final: me ajude a entender o raciocínio.",
  ocr_language: "por+eng",
  ocr_preprocess: "balanced",
  scroll_speed: 4,
  history_limit: 8,
  reuse_ai_tab: false,
  privacy_auto_delete_days: 0,
  mini_panel: true,
  theme: "system",
  language: "pt",
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withWindowHiddenForCapture<T>(task: () => Promise<T>): Promise<T> {
  const maybeTauri = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if (!maybeTauri.__TAURI__ && !maybeTauri.__TAURI_INTERNALS__) {
    return task();
  }

  let appWindow:
    | {
        minimize: () => Promise<void>;
        unminimize: () => Promise<void>;
        setFocus: () => Promise<void>;
      }
    | null = null;

  try {
    const windowApi = await import("@tauri-apps/api/window");
    appWindow = windowApi.getCurrentWindow();
    await appWindow.minimize();
    await wait(260);
  } catch {
    return task();
  }

  try {
    return await task();
  } finally {
    try {
      await appWindow?.unminimize();
      await appWindow?.setFocus();
    } catch {
      // Best-effort restore; the capture flow remains valid even if focus fails.
    }
  }
}

export function App() {
  const [state, setState] = useState<BackendState | null>(null);
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [ocrText, setOcrText] = useState("");
  const [promptTemplate, setPromptTemplate] = useState(fallbackSettings.prompt_template);
  const [status, setStatus] = useState({ label: "status.connecting", tone: "working" });
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<"assistant" | "course">("assistant");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [courseDraft, setCourseDraft] = useState<CourseContext | null>(null);
  const [coursePrompt, setCoursePrompt] = useState("");
  const [courseNoteText, setCourseNoteText] = useState("");
  const [courseResponse, setCourseResponse] = useState("");
  const [selectedCoursePrompt, setSelectedCoursePrompt] = useState("text_lesson");
  const [sendSteps, setSendSteps] = useState([
    { label: "Preparar conteudo", done: false },
    { label: "Copiar para area de transferencia", done: false },
    { label: "Abrir IA escolhida", done: false },
    { label: "Aguardar usuario colar/enviar", done: false },
  ]);

  const { t } = useI18n(settings.language as Locale);

  const providers = state?.providers ?? [];
  const current = state?.current ?? null;
  const course = state?.course ?? null;
  const courseContext = courseDraft ?? course?.context ?? null;
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.name === settings.ai_provider) ?? providers[0],
    [providers, settings.ai_provider],
  );

  // Theme effect
  useEffect(() => {
    const applyTheme = () => {
      let theme = settings.theme;
      if (theme === "system") {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      document.documentElement.setAttribute("data-theme", theme);
    };

    applyTheme();

    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme();
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [settings.theme]);

  const applyState = useCallback((next: BackendState) => {
    setState(next);
    setSettings(next.settings);
    setPromptTemplate(next.settings.prompt_template);
    setOcrText(next.current?.ocrText ?? "");
    setCourseDraft(next.course.context);
    setCoursePrompt(next.course.context.lastPrompt || "");
    setSelectedCoursePrompt(next.course.context.lastPromptType || "text_lesson");
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyState(await api.state());
      setStatus({ label: "status.ready", tone: "ready" });
    } catch {
      setStatus({ label: "status.offline", tone: "error" });
    }
  }, [applyState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void stopScroll();
        return;
      }
      if (!event.ctrlKey || !event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void capture();
      } else if (key === "o") {
        event.preventDefault();
        void reprocessOcr();
      } else if (key === "c") {
        event.preventDefault();
        void copyCurrent("Texto OCR");
      } else if (key === "p") {
        event.preventDefault();
        void copyCoursePrompt();
      } else if (key === "v") {
        event.preventDefault();
        void pasteNow();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void scroll("down");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        void scroll("up");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function saveSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      applyState(await api.updateSettings(next));
    } catch {
      setStatus({ label: "status.settingsError", tone: "error" });
    }
  }

  function markSendStep(index: number, done: boolean) {
    setSendSteps((steps) => steps.map((step, currentIndex) => (currentIndex === index ? { ...step, done } : step)));
  }

  async function applyStudyProfile(profileName: string) {
    const profile = studyProfiles.find((item) => item.name === profileName) ?? studyProfiles[0];
    setPromptTemplate(profile.prompt);
    await saveSettings({
      study_profile: profile.name,
      ai_provider: profile.provider,
      prompt_template: profile.prompt,
    });
  }

  async function capture() {
    setBusy(true);
    setStatus({ label: "status.waitingCrop", tone: "working" });
    try {
      const result = await withWindowHiddenForCapture(() => api.capture());
      if (result.state) applyState(result.state);
      setStatus(result.cancelled ? { label: "status.cropCancelled", tone: "ready" } : { label: "status.ocrDone", tone: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : t("status.unknownError");
      setStatus({ label: `${t("status.cropError")}: ${detail}`, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copyCurrent(mode = settings.paste_mode) {
    if (!current) {
      setStatus({ label: "status.noCapture", tone: "error" });
      return false;
    }
    setBusy(true);
    try {
      const result = await api.copy({
        mode,
        ocrText,
        prompt: buildPrompt(current, promptTemplate, ocrText),
      });
      if (result.state) applyState(result.state);
      setStatus({ label: result.message ?? t("status.copied"), tone: result.ok ? "success" : "error" });
      return Boolean(result.ok);
    } finally {
      setBusy(false);
    }
  }

  async function pasteNow() {
    if (!current) {
      setStatus({ label: "status.noCapture", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const result = await api.paste({
        mode: settings.paste_mode,
        ocrText,
        prompt: buildPrompt(current, promptTemplate, ocrText),
      });
      if (result.state) applyState(result.state);
      setStatus({ label: "status.ctrlVSent", tone: result.ok ? "success" : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function openAi(provider = settings.ai_provider) {
    const result = await api.openAi(provider);
    if (result.state) applyState(result.state);
    setStatus({ label: result.ok ? `${provider} ${t("status.openedAi")}` : t("status.openAiFail"), tone: result.ok ? "success" : "error" });
    return Boolean(result.ok);
  }

  async function sendToChatGPT() {
    await sendToSelectedAi("ChatGPT");
  }

  async function sendToSelectedAi(provider = settings.ai_provider) {
    setSendSteps((steps) => steps.map((step) => ({ ...step, done: false })));
    markSendStep(0, true);
    if (settings.ai_provider !== provider) {
      await saveSettings({ ai_provider: provider });
    }
    const copied = current ? await copyCurrent(settings.paste_mode) : true;
    markSendStep(1, copied);
    const opened = await openAi(provider);
    markSendStep(2, opened);
    markSendStep(3, true);
  }

  async function reprocessOcr() {
    if (!current) {
      setStatus({ label: "status.noCapture", tone: "error" });
      return;
    }
    setBusy(true);
    setStatus({ label: "Reprocessando OCR", tone: "working" });
    try {
      const result = await api.reprocessOcr({
        ocrLanguage: settings.ocr_language,
        ocrPreprocess: settings.ocr_preprocess,
      });
      if (result.state) applyState(result.state);
      setStatus({ label: result.message ?? "OCR reprocessado", tone: result.ok ? "success" : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function clearPrivateData() {
    const result = await api.clearPrivacy();
    if (result.state) applyState(result.state);
    setStatus({ label: result.message ?? "Historico limpo", tone: result.ok ? "success" : "error" });
  }

  async function copyDiagnostics() {
    const result = await api.diagnostics();
    if (result.state) applyState(result.state);
    if (result.diagnostic) {
      await navigator.clipboard.writeText(result.diagnostic);
    }
    setStatus({ label: "Diagnostico copiado", tone: result.ok ? "success" : "error" });
  }

  async function openImage(captureItem = current) {
    if (!captureItem) return;
    const result = await api.openImage(captureItem.imagePath);
    if (result.state) applyState(result.state);
    setStatus({ label: result.message ?? t("status.imageOpened"), tone: result.ok ? "success" : "error" });
  }

  async function scroll(direction: "up" | "down") {
    const result = await api.startScroll(direction, settings.scroll_speed);
    if (result.state) applyState(result.state);
    setStatus({ label: direction === "down" ? "status.scrollDown" : "status.scrollUp", tone: "scroll" });
  }

  async function stopScroll() {
    const result = await api.stopScroll();
    if (result.state) applyState(result.state);
    setStatus({ label: "status.scrollStopped", tone: "ready" });
  }

  function updateCourseDraft<K extends keyof CourseContext>(key: K, value: CourseContext[K]) {
    if (!courseContext) return;
    setCourseDraft({ ...courseContext, [key]: value });
  }

  async function persistCourseContext(nextContext?: CourseContext | null) {
    const contextToSave = nextContext ?? courseDraft ?? course?.context;
    if (!contextToSave) return;
    try {
      const result = await api.updateCourse(contextToSave);
      if (result.state) applyState(result.state);
      setStatus({ label: "Modo Curso atualizado", tone: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "erro desconhecido";
      setStatus({ label: `Erro ao salvar curso: ${detail}`, tone: "error" });
    }
  }

  async function captureCourseContent() {
    setBusy(true);
    setStatus({ label: "Capturando conteudo do curso", tone: "working" });
    try {
      await persistCourseContext();
      const result = await withWindowHiddenForCapture(() => api.captureCourse());
      if (result.state) applyState(result.state);
      setStatus(result.cancelled ? { label: "status.cropCancelled", tone: "ready" } : { label: "Conteudo capturado no Modo Curso", tone: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "erro desconhecido";
      setStatus({ label: `Erro ao recortar: ${detail}`, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function generateCoursePrompt(promptType = selectedCoursePrompt, copy = true) {
    setSelectedCoursePrompt(promptType);
    setBusy(true);
    setStatus({ label: "Preparando prompt de estudo", tone: "working" });
    try {
      await persistCourseContext();
      const result = await api.coursePrompt({
        promptType,
        ocrText,
        extraText: courseNoteText,
        copy,
      });
      if (result.state) applyState(result.state);
      if (result.prompt) setCoursePrompt(result.prompt);
      setStatus({ label: copy ? "Prompt copiado para IA" : "Prompt pronto", tone: "success" });
      return result.prompt ?? "";
    } catch (error) {
      const detail = error instanceof Error ? error.message : "erro desconhecido";
      setStatus({ label: `Erro ao gerar prompt: ${detail}`, tone: "error" });
      return "";
    } finally {
      setBusy(false);
    }
  }

  async function copyCoursePrompt() {
    if (coursePrompt.trim()) {
      try {
        await navigator.clipboard.writeText(coursePrompt);
        setStatus({ label: "Prompt copiado", tone: "success" });
        return;
      } catch {
        // Fall through to the backend clipboard path.
      }
    }
    await generateCoursePrompt(selectedCoursePrompt, true);
  }

  async function saveCourseNote() {
    const text = courseNoteText.trim() || ocrText.trim();
    if (!text && !courseResponse.trim() && !coursePrompt.trim()) {
      setStatus({ label: "Nada para salvar na nota", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const label = course?.promptLabels[selectedCoursePrompt] ?? "Nota de estudo";
      const result = await api.saveCourseNote({
        kind: selectedCoursePrompt,
        title: label,
        text,
        response: courseResponse,
        prompt: coursePrompt,
        imagePath: current?.imagePath ?? "",
      });
      if (result.state) applyState(result.state);
      setStatus({ label: result.message ?? "Nota salva", tone: result.ok ? "success" : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function startCourseSession() {
    const result = await api.startCourseSession();
    if (result.state) applyState(result.state);
    setStatus({ label: "Sessao de estudo iniciada", tone: "success" });
  }

  async function pauseCourseSession() {
    const result = await api.pauseCourseSession();
    if (result.state) applyState(result.state);
    setStatus({ label: "Sessao de estudo pausada", tone: "ready" });
  }

  async function exportCourseSession(format: "md" | "txt" | "json") {
    const result = await api.exportCourseSession(format);
    if (result.state) applyState(result.state);
    setStatus({ label: result.message ?? "Sessao exportada", tone: result.ok ? "success" : "error" });
  }

  function statusText(label: string): string {
    // If it's a translation key, translate it. Otherwise return as-is.
    if (label.includes(".")) {
      const translated = t(label);
      return translated !== label ? translated : label;
    }
    return label;
  }

  const themeIcon = settings.theme === "dark" ? <Moon size={15} /> : settings.theme === "light" ? <Sun size={15} /> : <RefreshCw size={13} />;

  return (
    <div className="h-screen overflow-hidden" style={{ background: "var(--bg-app)", color: "var(--text-primary)" }}>
      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile menu toggle */}
      <button className="sidebar-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <div className="flex h-screen overflow-hidden">
        {/* ─── Sidebar ─── */}
        <aside
          className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileMenuOpen ? "open" : ""} sticky top-0 flex h-screen flex-col p-4 text-white`}
          style={{ background: "var(--bg-sidebar)" }}
        >
          <div className="sidebar-logo flex items-center gap-3">
            <img src={`${API_BASE}/assets/olheiro_256x256.png`} className="h-9 w-9 rounded-xl object-contain" alt="Olheiro" />
            <div className="sidebar-title">
              <h1 className="text-xl font-semibold tracking-tight">Olheiro</h1>
              <p className="text-xs" style={{ color: "var(--text-sidebar-muted)" }}>{t("sidebar.subtitle")}</p>
            </div>
          </div>

          <div className="mt-8 space-y-2">
            <SidebarButton icon={<MousePointer2 size={16} />} label={t("sidebar.capture")} onClick={capture} collapsed={sidebarCollapsed} primary={activeView === "assistant"} />
            <SidebarButton icon={<ListChecks size={16} />} label="Modo Curso" onClick={() => setActiveView("course")} collapsed={sidebarCollapsed} primary={activeView === "course"} />
            <SidebarButton icon={<Bot size={16} />} label={t("sidebar.sendChatGPT")} onClick={() => sendToSelectedAi()} collapsed={sidebarCollapsed} />
            <SidebarButton icon={<Clipboard size={16} />} label={t("sidebar.pasteNow")} onClick={pasteNow} collapsed={sidebarCollapsed} />
            <SidebarButton icon={<Square size={16} />} label={t("sidebar.stopScroll")} onClick={stopScroll} collapsed={sidebarCollapsed} />
          </div>

          {/* Theme / Language quick toggles */}
          <div className="mt-6 space-y-2">
            <SidebarButton
              icon={themeIcon}
              label={`${t("label.theme")}: ${t(`theme.${settings.theme}`)}`}
              onClick={() => {
                const next = settings.theme === "light" ? "dark" : settings.theme === "dark" ? "system" : "light";
                void saveSettings({ theme: next });
              }}
              collapsed={sidebarCollapsed}
            />
            <SidebarButton
              icon={<Globe size={15} />}
              label={settings.language === "pt" ? "Português" : "English"}
              onClick={() => void saveSettings({ language: settings.language === "pt" ? "en" : "pt" })}
              collapsed={sidebarCollapsed}
            />
          </div>

          {/* Collapse toggle (desktop only) */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="mt-auto hidden items-center justify-center rounded-xl p-2 text-white/60 transition hover:bg-white/10 hover:text-white md:flex"
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          {!sidebarCollapsed && (
            <div className="sidebar-info mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs" style={{ color: "var(--text-sidebar-muted)" }}>
              <p className="font-medium text-white">{t("sidebar.userControl")}</p>
              <p className="mt-1.5 leading-relaxed">{t("sidebar.userControlDesc")}</p>
            </div>
          )}
        </aside>

        {/* ─── Main ─── */}
        <main className="main-content h-screen flex-1 overflow-y-auto p-4 lg:p-6" style={{ background: "var(--bg-app)" }}>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <img src={`${API_BASE}/assets/olheiro_trim.png`} className="h-12 w-auto object-contain" alt="Olheiro" />
              <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>{t("misc.subtitle")}</p>
            </div>
            <StatusPill label={statusText(status.label)} tone={status.tone} busy={busy} />
          </header>

          {activeView === "assistant" ? (
          <section className="mt-6 grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="space-y-4">
              <Card title={t("card.aiConfig")} subtitle={t("card.aiConfigSub")}>
                <div className="grid gap-3 xl:grid-cols-[minmax(160px,0.8fr)_minmax(320px,1.4fr)_minmax(160px,0.8fr)_auto]">
                  <Select label="Perfil de estudo" value={settings.study_profile} options={studyProfiles.map((profile) => profile.name)} onChange={(profile) => applyStudyProfile(profile)} />
                  <ProviderSelect
                    providers={providers}
                    value={settings.ai_provider}
                    onChange={(ai_provider) => {
                      void saveSettings({ ai_provider });
                      void openAi(ai_provider);
                    }}
                    label={t("label.ai")}
                  />
                  <Select label={t("label.content")} value={settings.paste_mode} options={pasteModes} onChange={(paste_mode) => saveSettings({ paste_mode })} />
                  <button className="btn btn-dark h-10 self-end" onClick={() => openAi()}>
                    <ExternalLink size={15} />
                    <span className="sidebar-label">{t("label.openAi")}</span>
                  </button>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_150px]">
                  <div className="space-y-2">
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                      <Switch label={t("switch.openAfterCapture")} checked={settings.auto_open_after_capture} onChange={(auto_open_after_capture) => saveSettings({ auto_open_after_capture })} />
                      <Switch label={t("switch.copyAfterCapture")} checked={settings.auto_copy_after_capture} onChange={(auto_copy_after_capture) => saveSettings({ auto_copy_after_capture })} />
                      <Switch label={t("switch.pasteAfterDelay")} checked={settings.auto_paste_after_delay} onChange={(auto_paste_after_delay) => saveSettings({ auto_paste_after_delay })} />
                      <Switch label={t("switch.saveCaptures")} checked={settings.save_captures} onChange={(save_captures) => saveSettings({ save_captures })} />
                      <Switch label={t("switch.reuseAiTab")} checked={settings.reuse_ai_tab} onChange={(reuse_ai_tab) => saveSettings({ reuse_ai_tab })} />
                      <Switch label="Mini painel" checked={settings.mini_panel} onChange={(mini_panel) => saveSettings({ mini_panel })} />
                    </div>
                  </div>
                  <Select
                    label={t("label.delay")}
                    value={String(settings.paste_delay_seconds)}
                    options={["3", "5", "8", "12"]}
                    onChange={(value) => saveSettings({ paste_delay_seconds: Number(value) })}
                  />
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{t("label.scrollSpeed")}</label>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--accent-bg)", color: "var(--accent-text)" }}>{settings.scroll_speed}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={settings.scroll_speed}
                    onChange={(event) => saveSettings({ scroll_speed: Number(event.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(160px,1fr)_minmax(170px,1fr)_auto]">
                  <Select label="Idioma OCR" value={settings.ocr_language} options={ocrLanguages} onChange={(ocr_language) => saveSettings({ ocr_language })} />
                  <Select label="Preprocessamento" value={settings.ocr_preprocess} options={ocrModes} onChange={(ocr_preprocess) => saveSettings({ ocr_preprocess })} />
                  <button className="btn btn-soft h-10 self-end" onClick={reprocessOcr} disabled={!current || busy}>
                    <Wand2 size={15} />
                    Reprocessar OCR
                  </button>
                </div>

                <SendQueue steps={sendSteps} provider={selectedProvider?.name ?? settings.ai_provider} />

                <label className="mt-4 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{t("label.defaultPrompt")}</label>
                <textarea
                  value={promptTemplate}
                  onChange={(event) => setPromptTemplate(event.target.value)}
                  onBlur={() => saveSettings({ prompt_template: promptTemplate })}
                  className="mt-1.5 min-h-24 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2"
                  style={{
                    borderColor: "var(--border-default)",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                    "--tw-ring-color": "var(--ring-focus)",
                  } as React.CSSProperties}
                />
              </Card>

              <Card title={t("card.quickActions")} subtitle={t("card.quickActionsSub")}>
                <div className="grid gap-2 sm:grid-cols-3">
                  <ActionButton icon={<MousePointer2 />} label={t("btn.capture")} onClick={capture} primary />
                  <ActionButton icon={<Send />} label="Enviar para IA" onClick={() => sendToSelectedAi()} />
                  <ActionButton icon={<FileText />} label={t("btn.copyOcr")} onClick={() => copyCurrent("Texto OCR")} />
                  <ActionButton icon={<Clipboard />} label={t("btn.pasteNow")} onClick={pasteNow} />
                  <ActionButton icon={<ArrowDown />} label={t("btn.scrollDown")} onClick={() => scroll("down")} subtle />
                  <ActionButton icon={<ArrowUp />} label={t("btn.scrollUp")} onClick={() => scroll("up")} subtle />
                  <ActionButton icon={<Square />} label={t("btn.stopScroll")} onClick={stopScroll} subtle />
                </div>
              </Card>

              <Card title={t("card.history")} subtitle={t("card.historySub")}>
                <div className="space-y-2">
                  {(state?.history ?? []).length === 0 && <EmptyState text={t("misc.noHistory")} />}
                  {(state?.history ?? []).map((item) => (
                    <HistoryRow key={`${item.fileName}-${item.time}`} item={item} onCopy={() => copyHistory(item)} onOpen={() => openImage(item)} />
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <Card title={t("card.lastCapture")} subtitle={t("card.lastCaptureSub")}>
                <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-default)", background: "var(--bg-input)" }}>
                  {current ? (
                    <img src={`${API_BASE}${current.imageUrl}`} className="max-h-48 w-full object-contain" alt="" />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>{t("misc.previewPlaceholder")}</div>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{current?.fileName ?? t("misc.noCapture")}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{current?.ocrStatus ?? t("misc.useCaptureToStart")}</p>
                  </div>
                  {current && <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{current.time}</span>}
                </div>
                <textarea
                  value={ocrText}
                  onChange={(event) => setOcrText(event.target.value)}
                  disabled={!current}
                  className="mt-3 min-h-36 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2 disabled:opacity-40"
                  style={{
                    borderColor: "var(--border-default)",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                    "--tw-ring-color": "var(--ring-focus)",
                  } as React.CSSProperties}
                  placeholder={t("misc.ocrPlaceholder")}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button className="btn btn-dark" onClick={() => copyCurrent("Texto OCR")} disabled={!current}>
                    <FileText size={15} />
                    {t("btn.copyOcr")}
                  </button>
                  <button className="btn btn-soft" onClick={() => copyCurrent("Prompt")} disabled={!current}>
                    <Copy size={15} />
                    {t("btn.copyPrompt")}
                  </button>
                  <button className="btn btn-soft" onClick={() => copyCurrent("Imagem")} disabled={!current}>
                    <ImageIcon size={15} />
                    {t("btn.copyImage")}
                  </button>
                  <button className="btn btn-soft" onClick={() => openImage()} disabled={!current}>
                    <ExternalLink size={15} />
                    {t("btn.openImage")}
                  </button>
                </div>
              </Card>

              <Card title={t("card.systemStatus")} subtitle={t("card.systemStatusSub")}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Metric label={t("metric.ocr")} value={state?.system.ocr ?? t("metric.connecting")} />
                  <Metric label={t("metric.scroll")} value={state?.system.scroll ?? t("metric.stopped")} />
                  <Metric label={t("metric.backend")} value={state?.system.backend ?? t("metric.offline")} />
                  <Metric label={t("metric.captures")} value={state?.system.captures ?? t("metric.unavailable")} />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Select
                    label="Auto-delete de capturas"
                    value={String(settings.privacy_auto_delete_days)}
                    options={retentionOptions}
                    onChange={(privacy_auto_delete_days) => saveSettings({ privacy_auto_delete_days: Number(privacy_auto_delete_days) })}
                  />
                  <button className="btn btn-soft mt-5 h-10 self-start" onClick={clearPrivateData}>
                    <Trash2 size={15} />
                    Limpar dados
                  </button>
                </div>
              </Card>

              <Card title={t("card.log")} subtitle={t("card.logSub")}>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button className="btn btn-soft" onClick={copyDiagnostics}>
                    <ListChecks size={15} />
                    Copiar diagnostico
                  </button>
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl p-2 text-xs" style={{ background: "var(--bg-input)", color: "var(--text-secondary)" }}>
                  {(state?.logs ?? []).length === 0 && <span>{t("misc.noLog")}</span>}
                  {(state?.logs ?? []).map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              </Card>
            </div>
          </section>
          ) : course && courseContext ? (
            <CourseMode
              course={course}
              context={courseContext}
              current={current}
              providers={providers}
              selectedProvider={selectedProvider}
              settings={settings}
              busy={busy}
              ocrText={ocrText}
              prompt={coursePrompt}
              noteText={courseNoteText}
              responseText={courseResponse}
              selectedPromptType={selectedCoursePrompt}
              onFieldChange={updateCourseDraft}
              onPersistContext={persistCourseContext}
              onOcrChange={setOcrText}
              onPromptChange={setCoursePrompt}
              onNoteTextChange={setCourseNoteText}
              onResponseChange={setCourseResponse}
              onPromptTypeChange={setSelectedCoursePrompt}
              onCapture={captureCourseContent}
              onGeneratePrompt={generateCoursePrompt}
              onCopyPrompt={copyCoursePrompt}
              onSaveNote={saveCourseNote}
              onOpenAi={openAi}
              onStartSession={startCourseSession}
              onPauseSession={pauseCourseSession}
              onExport={exportCourseSession}
              onSaveSettings={saveSettings}
            />
          ) : (
            <div className="mt-6">
              <Card title="Modo Curso" subtitle="Conectando estado local do curso.">
                <EmptyState text="Aguardando backend do Olheiro." />
              </Card>
            </div>
          )}
        </main>
      </div>
      {settings.mini_panel && (
        <MiniPanel
          status={statusText(status.label)}
          busy={busy}
          onCapture={capture}
          onPaste={pasteNow}
          onStopScroll={stopScroll}
          onSend={() => sendToSelectedAi()}
        />
      )}
    </div>
  );

  async function copyHistory(item: Capture) {
    await api.copy({ mode: "Texto OCR", ocrText: item.ocrText, prompt: item.prompt });
    setStatus({ label: "status.historyCopied", tone: "success" });
  }
}

function buildPrompt(capture: Capture, template: string, text: string) {
  const textBlock = text.trim() || "[Nenhum texto OCR detectado.]";
  return `${template.trim()}\n\nArquivo do recorte salvo em:\n${capture.imagePath}\n\nTexto extraido por OCR:\n${textBlock}\n`;
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${secs}s`;
  return `${secs}s`;
}

function CourseMode({
  course,
  context,
  current,
  providers,
  selectedProvider,
  settings,
  busy,
  ocrText,
  prompt,
  noteText,
  responseText,
  selectedPromptType,
  onFieldChange,
  onPersistContext,
  onOcrChange,
  onPromptChange,
  onNoteTextChange,
  onResponseChange,
  onPromptTypeChange,
  onCapture,
  onGeneratePrompt,
  onCopyPrompt,
  onSaveNote,
  onOpenAi,
  onStartSession,
  onPauseSession,
  onExport,
  onSaveSettings,
}: {
  course: CourseState;
  context: CourseContext;
  current: Capture | null;
  providers: Provider[];
  selectedProvider?: Provider;
  settings: Settings;
  busy: boolean;
  ocrText: string;
  prompt: string;
  noteText: string;
  responseText: string;
  selectedPromptType: string;
  onFieldChange: <K extends keyof CourseContext>(key: K, value: CourseContext[K]) => void;
  onPersistContext: (nextContext?: CourseContext) => void | Promise<void>;
  onOcrChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onNoteTextChange: (value: string) => void;
  onResponseChange: (value: string) => void;
  onPromptTypeChange: (value: string) => void;
  onCapture: () => void;
  onGeneratePrompt: (promptType?: string, copy?: boolean) => Promise<string>;
  onCopyPrompt: () => void;
  onSaveNote: () => void;
  onOpenAi: (provider?: string) => Promise<boolean>;
  onStartSession: () => void;
  onPauseSession: () => void;
  onExport: (format: "md" | "txt" | "json") => void;
  onSaveSettings: (patch: Partial<Settings>) => Promise<void>;
}) {
  const promptOptions = coursePromptOrder.filter((key) => course.promptLabels[key]);
  const selectedPromptLabel = course.promptLabels[selectedPromptType] ?? "Prompt de estudo";

  return (
    <section className="mt-6 space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <Card title="Modo Curso" subtitle="Organize curso, modulo, aula, capturas, OCR e prompts sem controlar a plataforma.">
          <div className="grid gap-3 lg:grid-cols-3">
            <TextInput label="Curso atual" value={context.courseName} onChange={(value) => onFieldChange("courseName", value)} onBlur={onPersistContext} />
            <TextInput label="Modulo atual" value={context.moduleName} onChange={(value) => onFieldChange("moduleName", value)} onBlur={onPersistContext} />
            <TextInput label="Aula atual" value={context.lessonName} onChange={(value) => onFieldChange("lessonName", value)} onBlur={onPersistContext} />
            <Select
              label="Tipo de conteudo"
              value={context.contentType}
              options={contentTypeOptions}
              labels={contentTypeLabels}
              onChange={(contentType) => {
                const nextContext = { ...context, contentType };
                onFieldChange("contentType", contentType);
                void onPersistContext(nextContext);
              }}
            />
            <Select
              label="Status manual"
              value={context.status}
              options={statusOptions}
              labels={statusLabels}
              onChange={(nextStatus) => {
                const nextContext = { ...context, status: nextStatus };
                onFieldChange("status", nextStatus);
                void onPersistContext(nextContext);
              }}
            />
            <TextInput label="Minuto do video" value={context.videoMinute} onChange={(value) => onFieldChange("videoMinute", value)} onBlur={onPersistContext} placeholder="Ex.: 12:40" />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)_auto]">
            <Select
              label="Prompt inteligente"
              value={selectedPromptType}
              options={promptOptions}
              labels={course.promptLabels}
              onChange={(value) => {
                const nextContext = { ...context, lastPromptType: value };
                onPromptTypeChange(value);
                onFieldChange("lastPromptType", value);
                void onPersistContext(nextContext);
              }}
            />
            <ProviderSelect
              providers={providers}
              value={settings.ai_provider}
              onChange={(ai_provider) => {
                void onSaveSettings({ ai_provider });
                void onOpenAi(ai_provider);
              }}
              label="IA de estudo"
            />
            <button className="btn btn-dark h-10 self-end" onClick={() => onOpenAi(settings.ai_provider)}>
              <ExternalLink size={15} />
              Abrir IA
            </button>
          </div>

          <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <Switch label="Abrir IA apos recorte" checked={settings.auto_open_after_capture} onChange={(auto_open_after_capture) => onSaveSettings({ auto_open_after_capture })} />
            <Switch label="Copiar OCR apos recorte" checked={settings.auto_copy_after_capture} onChange={(auto_copy_after_capture) => onSaveSettings({ auto_copy_after_capture })} />
            <Switch label="Salvar notas do curso" checked={settings.save_course_notes_auto} onChange={(save_course_notes_auto) => onSaveSettings({ save_course_notes_auto })} />
            <Switch label="Salvar prints" checked={settings.save_captures} onChange={(save_captures) => onSaveSettings({ save_captures })} />
          </div>
        </Card>

        <Card title="Produtividade" subtitle="Sessao local, progresso manual e exportacao.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Metric label="Recortes" value={String(course.stats.totalCaptures)} />
            <Metric label="Notas" value={String(course.stats.totalNotes)} />
            <Metric label="Modulos revisados" value={String(course.stats.reviewedModules)} />
            <Metric label="Aulas concluidas" value={String(course.stats.completedLessons)} />
            <Metric label="Tempo da sessao" value={formatDuration(course.stats.sessionSeconds)} />
            <Metric label="Status" value={course.session.running ? "Sessao ativa" : "Sessao pausada"} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {course.session.running ? (
              <button className="btn btn-soft" onClick={onPauseSession}>
                <Square size={15} />
                Pausar sessao
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onStartSession}>
                <Play size={15} />
                Iniciar sessao
              </button>
            )}
            <button className="btn btn-dark" onClick={() => onOpenAi("ChatGPT")}>
              <Bot size={15} />
              Abrir ChatGPT
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button className="btn btn-soft" onClick={() => onExport("md")}>Exportar .md</button>
            <button className="btn btn-soft" onClick={() => onExport("txt")}>Exportar .txt</button>
            <button className="btn btn-soft" onClick={() => onExport("json")}>Exportar .json</button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card title="Captura e OCR produtivo" subtitle="Recorte a aula, revise o texto e escolha como estudar.">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-default)", background: "var(--bg-input)" }}>
                {current ? (
                  <img src={`${API_BASE}${current.imageUrl}`} className="h-40 w-full object-contain" alt="" />
                ) : (
                  <div className="flex h-40 items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>Nenhum recorte ainda</div>
                )}
              </div>
              <p className="mt-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{current?.fileName ?? "Aguardando recorte"}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{current?.ocrStatus ?? "OCR aparece aqui depois da captura"}</p>
            </div>
            <div className="min-w-0">
              <textarea
                value={ocrText}
                onChange={(event) => onOcrChange(event.target.value)}
                className="min-h-44 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2"
                style={{
                  borderColor: "var(--border-default)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--ring-focus)",
                } as React.CSSProperties}
                placeholder="Texto OCR editavel do recorte."
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <button className="btn btn-primary" onClick={onCapture} disabled={busy}>
                  <MousePointer2 size={15} />
                  Capturar tela
                </button>
                <button className="btn btn-soft" onClick={() => onNoteTextChange(ocrText)} disabled={!ocrText.trim()}>
                  <FileText size={15} />
                  Usar OCR na nota
                </button>
                <button className="btn btn-soft" onClick={() => onGeneratePrompt("step_by_step", true)} disabled={busy}>
                  <Wand2 size={15} />
                  Explicar
                </button>
                <button className="btn btn-soft" onClick={() => onGeneratePrompt("quick_review", true)} disabled={busy}>
                  <ListChecks size={15} />
                  Revisao
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Prompts de estudo" subtitle={`Selecionado: ${selectedPromptLabel}. Copia para a IA sem enviar Enter.`}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <button className="btn btn-dark" onClick={() => onGeneratePrompt("executive_summary", true)} disabled={busy}>
              <FileText size={15} />
              Gerar resumo
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("step_by_step", true)} disabled={busy}>
              <SlidersHorizontal size={15} />
              Passo a passo
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("review_questions", true)} disabled={busy}>
              <ListChecks size={15} />
              Perguntas
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("flashcards", true)} disabled={busy}>
              <Clipboard size={15} />
              Flashcards
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("glossary", true)} disabled={busy}>
              <ScrollText size={15} />
              Glossario
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("activity", true)} disabled={busy}>
              <Shield size={15} />
              Atividade guiada
            </button>
          </div>

          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="mt-3 min-h-40 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2"
            style={{
              borderColor: "var(--border-default)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              "--tw-ring-color": "var(--ring-focus)",
            } as React.CSSProperties}
            placeholder="O prompt completo aparece aqui para revisar antes de colar na IA."
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button className="btn btn-dark" onClick={onCopyPrompt}>
              <Copy size={15} />
              Copiar prompt
            </button>
            <button className="btn btn-soft" onClick={() => onOpenAi(settings.ai_provider)}>
              <ExternalLink size={15} />
              Abrir {selectedProvider?.name ?? "IA"}
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt(selectedPromptType, false)} disabled={busy}>
              <RefreshCw size={15} />
              Regerar sem copiar
            </button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Notas do curso" subtitle="Salve anotacoes, respostas revisadas e transcricoes por modulo/aula.">
          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Anotacao ou transcricao</label>
              <textarea
                value={noteText}
                onChange={(event) => onNoteTextChange(event.target.value)}
                className="mt-1.5 min-h-44 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2"
                style={{
                  borderColor: "var(--border-default)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--ring-focus)",
                } as React.CSSProperties}
                placeholder="Cole transcricao do video, anotacao manual ou texto revisado."
              />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Resposta/manual da IA</label>
              <textarea
                value={responseText}
                onChange={(event) => onResponseChange(event.target.value)}
                className="mt-1.5 min-h-44 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2"
                style={{
                  borderColor: "var(--border-default)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--ring-focus)",
                } as React.CSSProperties}
                placeholder="Cole aqui uma resposta revisada se quiser guardar junto da aula."
              />
            </div>
          </div>
          <label className="mt-3 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Anotacoes do video</label>
          <textarea
            value={context.videoNotes}
            onChange={(event) => onFieldChange("videoNotes", event.target.value)}
            onBlur={() => void onPersistContext()}
            className="mt-1.5 min-h-20 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none transition focus:ring-2"
            style={{
              borderColor: "var(--border-default)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              "--tw-ring-color": "var(--ring-focus)",
            } as React.CSSProperties}
            placeholder="Campo local para videoaulas: minuto, trecho, duvidas e pontos para revisar."
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button className="btn btn-primary" onClick={onSaveNote} disabled={busy}>
              <CheckCircle2 size={15} />
              Salvar nota
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("video", true)}>
              <Play size={15} />
              Resumir video
            </button>
            <button className="btn btn-soft" onClick={() => onGeneratePrompt("video_checklist", true)}>
              <ListChecks size={15} />
              Checklist video
            </button>
          </div>
        </Card>

        <Card title="Historico do curso" subtitle="Ultimas notas e destino local.">
          <div className="grid gap-2">
            <Metric label="Pasta de cursos" value={course.paths.currentLessonDir} />
            <Metric label="Tipo" value={contentTypeLabels[context.contentType] ?? context.contentType} />
            <Metric label="Status manual" value={statusLabels[context.status] ?? context.status} />
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {course.notes.length === 0 && <EmptyState text="Nenhuma nota salva neste curso ainda." />}
            {course.notes.map((note) => (
              <div key={note.id} className="rounded-xl p-3" style={{ background: "var(--bg-input)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{note.title}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{note.created_at}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{note.text || note.response || "Nota sem texto."}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function TextInput({ label, value, onChange, onBlur, placeholder }: { label: string; value: string; onChange: (value: string) => void; onBlur?: () => void | Promise<void>; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => void onBlur?.()}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-xl border px-2.5 text-xs font-medium outline-none transition focus:ring-2"
        style={{
          borderColor: "var(--border-default)",
          background: "var(--bg-input)",
          color: "var(--text-primary)",
          "--tw-ring-color": "var(--ring-focus)",
        } as React.CSSProperties}
      />
    </label>
  );
}

function SendQueue({ steps, provider }: { steps: { label: string; done: boolean }[]; provider: string }) {
  return (
    <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border-default)", background: "var(--bg-card-alt)" }}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
        <Send size={15} style={{ color: "var(--accent)" }} />
        Envio para IA: {provider}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ background: "var(--bg-input)", color: "var(--text-secondary)" }}>
            {step.done ? <CheckCircle2 size={14} style={{ color: "var(--success)" }} /> : <span className="h-3.5 w-3.5 rounded-full border" style={{ borderColor: "var(--border-default)" }} />}
            {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniPanel({ status, busy, onCapture, onPaste, onStopScroll, onSend }: { status: string; busy: boolean; onCapture: () => void; onPaste: () => void; onStopScroll: () => void; onSend: () => void }) {
  return (
    <div className="mini-panel">
      <div className="mini-panel-status">
        {busy ? <Loader2 className="animate-spin" size={13} /> : <PanelTop size={13} />}
        <span>{status}</span>
      </div>
      <button className="mini-btn primary" onClick={onCapture} title="Recortar tela">
        <MousePointer2 size={15} />
      </button>
      <button className="mini-btn" onClick={onSend} title="Enviar para IA">
        <Send size={15} />
      </button>
      <button className="mini-btn" onClick={onPaste} title="Colar agora">
        <Clipboard size={15} />
      </button>
      <button className="mini-btn danger" onClick={onStopScroll} title="Parar scroll">
        <Square size={15} />
      </button>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      className="min-w-0 overflow-hidden rounded-[18px] border p-4 transition-colors"
      style={{ borderColor: "var(--border-default)", background: "var(--bg-card)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function SidebarButton({ icon, label, onClick, primary = false, collapsed = false }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; collapsed?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
        primary
          ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          : "bg-white/10 text-white hover:bg-white/15"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {icon}
      {!collapsed && <span className="sidebar-label">{label}</span>}
    </button>
  );
}

function ProviderSelect({ providers, value, onChange, label }: { providers: Provider[]; value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="min-w-0">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <div className="mt-1.5 grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(128px,1fr))]">
        {providers.map((provider) => (
          <button
            key={provider.name}
            onClick={() => onChange(provider.name)}
            className="flex min-w-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition"
            style={{
              borderColor: value === provider.name ? "var(--border-focus)" : "var(--border-default)",
              background: value === provider.name ? "var(--accent-bg)" : "var(--bg-card-alt)",
              color: value === provider.name ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            <img src={`${API_BASE}${provider.icon}`} className="h-5 w-5 rounded object-contain" alt="" />
            <span className="truncate">{provider.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-xl border px-2.5 text-xs font-medium outline-none transition focus:ring-2"
        style={{
          borderColor: "var(--border-default)",
          background: "var(--bg-input)",
          color: "var(--text-primary)",
          "--tw-ring-color": "var(--ring-focus)",
        } as React.CSSProperties}
      >
        {options.map((option) => (
          <option key={option} value={option}>{labels?.[option] ?? option}</option>
        ))}
      </select>
    </label>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition"
      style={{ background: "var(--bg-input)" }}
    >
      <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? "bg-cyan-400" : ""}`} style={checked ? {} : { background: "var(--text-muted)" }}>
        <span className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </span>
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
    </button>
  );
}

function ActionButton({ icon, label, onClick, primary = false, subtle = false }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; subtle?: boolean }) {
  const className = primary ? "btn btn-primary" : subtle ? "btn btn-soft" : "btn btn-dark";
  return (
    <button className={`${className} min-w-0`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ label, tone, busy }: { label: string; tone: string; busy: boolean }) {
  const color = tone === "error" ? "var(--error)" : tone === "success" ? "var(--success)" : tone === "working" ? "var(--warning)" : "var(--accent)";
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"
      style={{ borderColor: "var(--border-default)", background: "var(--bg-card)", color: "var(--text-primary)" }}
    >
      {busy ? <Loader2 className="animate-spin" size={14} style={{ color: "var(--accent)" }} /> : <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--bg-input)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 break-words text-xs font-medium" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function HistoryRow({ item, onCopy, onOpen }: { item: Capture; onCopy: () => void; onOpen: () => void }) {
  return (
    <div className="grid gap-2 rounded-xl p-2 md:grid-cols-[64px_1fr_auto] md:items-center" style={{ background: "var(--bg-input)" }}>
      <img src={`${API_BASE}${item.imageUrl}`} className="h-12 w-16 rounded-lg border object-cover" style={{ borderColor: "var(--border-default)" }} alt="" />
      <div>
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.fileName}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {item.time} - {item.ocrStatus}
        </p>
      </div>
      <div className="flex gap-1.5">
        <button className="icon-btn" onClick={onCopy} title="Copy text">
          <FileText size={14} />
        </button>
        <button className="icon-btn" onClick={onOpen} title="Open image">
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl p-3 text-xs" style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
      <ScrollText size={16} />
      {text}
    </div>
  );
}
