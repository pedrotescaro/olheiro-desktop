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
import type { BackendState, Capture, Provider, Settings } from "./types";

const pasteModes = ["Texto OCR", "Imagem", "Prompt", "Prompt + imagem"];
const ocrLanguages = ["por+eng", "por", "eng", "spa", "eng+por"];
const ocrModes = ["balanced", "high_contrast", "raw"];
const retentionOptions = ["0", "1", "7", "15", "30", "90"];

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

export function App() {
  const [state, setState] = useState<BackendState | null>(null);
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [ocrText, setOcrText] = useState("");
  const [promptTemplate, setPromptTemplate] = useState(fallbackSettings.prompt_template);
  const [status, setStatus] = useState({ label: "status.connecting", tone: "working" });
  const [busy, setBusy] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sendSteps, setSendSteps] = useState([
    { label: "Preparar conteudo", done: false },
    { label: "Copiar para area de transferencia", done: false },
    { label: "Abrir IA escolhida", done: false },
    { label: "Aguardar usuario colar/enviar", done: false },
  ]);

  const { t } = useI18n(settings.language as Locale);

  const providers = state?.providers ?? [];
  const current = state?.current ?? null;
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
      if (!event.ctrlKey || !event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void capture();
      } else if (key === "c") {
        event.preventDefault();
        void copyCurrent("Texto OCR");
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
      const result = await api.capture();
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
            <SidebarButton icon={<MousePointer2 size={16} />} label={t("sidebar.capture")} onClick={capture} collapsed={sidebarCollapsed} primary />
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

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
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
          <option key={option}>{option}</option>
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
