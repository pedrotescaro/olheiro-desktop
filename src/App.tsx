import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  Play,
  ScrollText,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, api } from "./api";
import type { BackendState, Capture, Provider, Settings } from "./types";

const pasteModes = ["Texto OCR", "Imagem", "Prompt", "Prompt + imagem"];

const fallbackSettings: Settings = {
  ai_provider: "Gemini",
  paste_mode: "Texto OCR",
  paste_delay_seconds: 5,
  auto_open_after_capture: true,
  auto_copy_after_capture: true,
  auto_paste_after_delay: false,
  save_captures: true,
  prompt_template:
    "Estou estudando este conteudo. Explique em portugues, passo a passo, os conceitos principais do recorte. Se parecer questao de avaliacao, nao responda apenas com a alternativa final: me ajude a entender o raciocinio.",
  scroll_speed: 4,
  history_limit: 8,
};

export function App() {
  const [state, setState] = useState<BackendState | null>(null);
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [ocrText, setOcrText] = useState("");
  const [promptTemplate, setPromptTemplate] = useState(fallbackSettings.prompt_template);
  const [status, setStatus] = useState({ label: "Conectando backend", tone: "working" });
  const [busy, setBusy] = useState(false);

  const providers = state?.providers ?? [];
  const current = state?.current ?? null;
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.name === settings.ai_provider) ?? providers[0],
    [providers, settings.ai_provider],
  );

  const applyState = useCallback((next: BackendState) => {
    setState(next);
    setSettings(next.settings);
    setPromptTemplate(next.settings.prompt_template);
    setOcrText(next.current?.ocrText ?? "");
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyState(await api.state());
      setStatus({ label: "Pronto", tone: "ready" });
    } catch {
      setStatus({ label: "Backend offline", tone: "error" });
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
      setStatus({ label: "Falha ao salvar preferencias", tone: "error" });
    }
  }

  async function capture() {
    setBusy(true);
    setStatus({ label: "Aguardando recorte", tone: "working" });
    try {
      const result = await api.capture();
      if (result.state) applyState(result.state);
      setStatus(result.cancelled ? { label: "Recorte cancelado", tone: "ready" } : { label: "OCR concluido", tone: "success" });
    } catch {
      setStatus({ label: "Erro ao recortar", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copyCurrent(mode = settings.paste_mode) {
    if (!current) {
      setStatus({ label: "Nenhum recorte pronto", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const result = await api.copy({
        mode,
        ocrText,
        prompt: buildPrompt(current, promptTemplate, ocrText),
      });
      if (result.state) applyState(result.state);
      setStatus({ label: result.message ?? "Copiado", tone: result.ok ? "success" : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function pasteNow() {
    if (!current) {
      setStatus({ label: "Nenhum recorte pronto", tone: "error" });
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
      setStatus({ label: "Ctrl+V enviado sem Enter", tone: result.ok ? "success" : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function openAi(provider = settings.ai_provider) {
    const result = await api.openAi(provider);
    if (result.state) applyState(result.state);
    setStatus({ label: result.ok ? `${provider} aberto` : "Falha ao abrir IA", tone: result.ok ? "success" : "error" });
  }

  async function sendToChatGPT() {
    await saveSettings({ ai_provider: "ChatGPT" });
    if (current) await copyCurrent("Prompt");
    await openAi("ChatGPT");
  }

  async function openImage(captureItem = current) {
    if (!captureItem) return;
    const result = await api.openImage(captureItem.imagePath);
    if (result.state) applyState(result.state);
    setStatus({ label: result.message ?? "Imagem aberta", tone: result.ok ? "success" : "error" });
  }

  async function scroll(direction: "up" | "down") {
    const result = await api.startScroll(direction, settings.scroll_speed);
    if (result.state) applyState(result.state);
    setStatus({ label: direction === "down" ? "Scroll para baixo ativo" : "Scroll para cima ativo", tone: "scroll" });
  }

  async function stopScroll() {
    const result = await api.stopScroll();
    if (result.state) applyState(result.state);
    setStatus({ label: "Scroll parado", tone: "ready" });
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-950">
      <div className="grid h-screen grid-cols-[244px_minmax(0,1fr)] overflow-hidden">
        <aside className="sticky top-0 flex h-screen flex-col bg-[#071d49] p-5 text-white">
          <div className="flex items-center gap-3">
            <img src={`${API_BASE}/assets/favicon.png`} className="h-11 w-11 object-contain" alt="Olheiro" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Olheiro</h1>
              <p className="text-sm text-cyan-100/75">Assistente local de estudo</p>
            </div>
          </div>

          <div className="mt-10 space-y-3">
            <SidebarButton icon={<MousePointer2 size={18} />} label="Recortar tela" onClick={capture} primary />
            <SidebarButton icon={<Bot size={18} />} label="Enviar para ChatGPT" onClick={sendToChatGPT} />
            <SidebarButton icon={<Clipboard size={18} />} label="Colar agora" onClick={pasteNow} />
            <SidebarButton icon={<Square size={18} />} label="Parar scroll" onClick={stopScroll} />
          </div>

          <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-cyan-50/75">
            <p className="font-medium text-white">Controle do usuario</p>
            <p className="mt-2 leading-relaxed">O app copia, cola e abre paginas, mas nao envia Enter nem automatiza sites de curso.</p>
          </div>
        </aside>

        <main className="h-screen overflow-y-auto bg-[#eef3f8] p-6 lg:p-8">
          <header className="flex items-start justify-between gap-6">
            <div>
              <img src={`${API_BASE}/assets/olheiro_trim.png`} className="h-16 w-auto object-contain" alt="Olheiro" />
              <p className="mt-3 text-sm text-slate-600">Recorte, OCR, copia e colagem controlada para estudo.</p>
            </div>
            <StatusPill label={status.label} tone={status.tone} busy={busy} />
          </header>

          <section className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <div className="space-y-6">
              <Card title="Configuracao da IA" subtitle="Escolha destino, conteudo, prompt e automacoes locais.">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                  <ProviderSelect providers={providers} value={settings.ai_provider} onChange={(ai_provider) => saveSettings({ ai_provider })} />
                  <Select label="Conteudo" value={settings.paste_mode} options={pasteModes} onChange={(paste_mode) => saveSettings({ paste_mode })} />
                  <button className="btn btn-dark mt-6 h-11 self-start" onClick={() => openAi()}>
                    <ExternalLink size={17} />
                    Abrir IA
                  </button>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_170px]">
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Switch label="Abrir IA apos recorte" checked={settings.auto_open_after_capture} onChange={(auto_open_after_capture) => saveSettings({ auto_open_after_capture })} />
                      <Switch label="Copiar apos recorte" checked={settings.auto_copy_after_capture} onChange={(auto_copy_after_capture) => saveSettings({ auto_copy_after_capture })} />
                      <Switch label="Colar apos delay" checked={settings.auto_paste_after_delay} onChange={(auto_paste_after_delay) => saveSettings({ auto_paste_after_delay })} />
                      <Switch label="Salvar prints" checked={settings.save_captures} onChange={(save_captures) => saveSettings({ save_captures })} />
                    </div>
                  </div>
                  <Select
                    label="Delay"
                    value={String(settings.paste_delay_seconds)}
                    options={["3", "5", "8", "12"]}
                    onChange={(value) => saveSettings({ paste_delay_seconds: Number(value) })}
                  />
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Velocidade do scroll</label>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">{settings.scroll_speed}/10</span>
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

                <label className="mt-5 block text-sm font-medium text-slate-700">Prompt padrao</label>
                <textarea
                  value={promptTemplate}
                  onChange={(event) => setPromptTemplate(event.target.value)}
                  onBlur={() => saveSettings({ prompt_template: promptTemplate })}
                  className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none ring-cyan-200 transition focus:border-cyan-400 focus:ring-4"
                />
              </Card>

              <Card title="Acoes rapidas" subtitle="Comandos principais e atalhos de trabalho.">
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionButton icon={<MousePointer2 />} label="Recortar tela" onClick={capture} primary />
                  <ActionButton icon={<FileText />} label="Copiar OCR" onClick={() => copyCurrent("Texto OCR")} />
                  <ActionButton icon={<Clipboard />} label="Colar agora" onClick={pasteNow} />
                  <ActionButton icon={<ArrowDown />} label="Scroll baixo" onClick={() => scroll("down")} subtle />
                  <ActionButton icon={<ArrowUp />} label="Scroll cima" onClick={() => scroll("up")} subtle />
                  <ActionButton icon={<Square />} label="Parar scroll" onClick={stopScroll} subtle />
                </div>
              </Card>

              <Card title="Historico de recortes" subtitle="Ultimos recortes desta sessao.">
                <div className="space-y-3">
                  {(state?.history ?? []).length === 0 && <EmptyState text="Nenhum recorte nesta sessao ainda." />}
                  {(state?.history ?? []).map((item) => (
                    <HistoryRow key={`${item.fileName}-${item.time}`} item={item} onCopy={() => copyHistory(item)} onOpen={() => openImage(item)} />
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Ultimo recorte e OCR" subtitle="Revise o texto antes de copiar ou colar.">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {current ? (
                    <img src={`${API_BASE}${current.imageUrl}`} className="max-h-56 w-full object-contain" alt="Ultimo recorte" />
                  ) : (
                    <div className="flex h-44 items-center justify-center text-sm text-slate-400">Preview do recorte</div>
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{current?.fileName ?? "Nenhum recorte ainda"}</p>
                    <p className="mt-1 text-sm text-slate-500">{current?.ocrStatus ?? "Use Recortar tela para iniciar."}</p>
                  </div>
                  {current && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{current.time}</span>}
                </div>
                <textarea
                  value={ocrText}
                  onChange={(event) => setOcrText(event.target.value)}
                  disabled={!current}
                  className="mt-4 min-h-44 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none ring-cyan-200 transition focus:border-cyan-400 focus:ring-4 disabled:text-slate-400"
                  placeholder="Texto OCR aparece aqui."
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button className="btn btn-dark" onClick={() => copyCurrent("Texto OCR")} disabled={!current}>
                    <FileText size={17} />
                    Copiar OCR
                  </button>
                  <button className="btn btn-soft" onClick={() => copyCurrent("Prompt")} disabled={!current}>
                    <Copy size={17} />
                    Copiar prompt
                  </button>
                  <button className="btn btn-soft" onClick={() => copyCurrent("Imagem")} disabled={!current}>
                    <ImageIcon size={17} />
                    Copiar imagem
                  </button>
                  <button className="btn btn-soft" onClick={() => openImage()} disabled={!current}>
                    <ExternalLink size={17} />
                    Abrir imagem
                  </button>
                </div>
              </Card>

              <Card title="Status do sistema" subtitle="Diagnostico rapido do app local.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="OCR" value={state?.system.ocr ?? "Conectando"} />
                  <Metric label="Scroll" value={state?.system.scroll ?? "Parado"} />
                  <Metric label="Backend" value={state?.system.backend ?? "Offline"} />
                  <Metric label="Captures" value={state?.system.captures ?? "Indisponivel"} />
                </div>
              </Card>

              <Card title="Log" subtitle="Eventos recentes.">
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  {(state?.logs ?? []).length === 0 && <span>Nenhum evento ainda.</span>}
                  {(state?.logs ?? []).map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  );

  async function copyHistory(item: Capture) {
    await api.copy({ mode: "Texto OCR", ocrText: item.ocrText, prompt: item.prompt });
    setStatus({ label: "Texto do historico copiado", tone: "success" });
  }
}

function buildPrompt(capture: Capture, template: string, text: string) {
  const textBlock = text.trim() || "[Nenhum texto OCR detectado.]";
  return `${template.trim()}\n\nArquivo do recorte salvo em:\n${capture.imagePath}\n\nTexto extraido por OCR:\n${textBlock}\n`;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/70">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function SidebarButton({ icon, label, onClick, primary = false }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={
        primary
          ? "flex w-full items-center gap-3 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          : "flex w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
      }
    >
      {icon}
      {label}
    </button>
  );
}

function ProviderSelect({ providers, value, onChange }: { providers: Provider[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">IA</label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {providers.map((provider) => (
          <button
            key={provider.name}
            onClick={() => onChange(provider.name)}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
              value === provider.name
                ? "border-cyan-300 bg-cyan-50 text-slate-950 shadow-sm"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
            }`}
          >
            <img src={`${API_BASE}${provider.icon}`} className="h-6 w-6 rounded-md object-contain" alt="" />
            {provider.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none ring-cyan-200 transition focus:border-cyan-400 focus:ring-4"
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
    <button onClick={() => onChange(!checked)} className="flex min-h-12 items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100">
      <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${checked ? "bg-cyan-400" : "bg-slate-300"}`}>
        <span className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </button>
  );
}

function ActionButton({ icon, label, onClick, primary = false, subtle = false }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; subtle?: boolean }) {
  const className = primary ? "btn btn-primary" : subtle ? "btn btn-soft" : "btn btn-dark";
  return (
    <button className={className} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ label, tone, busy }: { label: string; tone: string; busy: boolean }) {
  const color = tone === "error" ? "bg-red-500" : tone === "success" ? "bg-emerald-500" : tone === "working" ? "bg-amber-500" : "bg-cyan-500";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
      {busy ? <Loader2 className="animate-spin text-cyan-500" size={16} /> : <span className={`h-2.5 w-2.5 rounded-full ${color}`} />}
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function HistoryRow({ item, onCopy, onOpen }: { item: Capture; onCopy: () => void; onOpen: () => void }) {
  return (
    <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 md:grid-cols-[76px_1fr_auto] md:items-center">
      <img src={`${API_BASE}${item.imageUrl}`} className="h-14 w-20 rounded-xl border border-slate-200 object-cover" alt="" />
      <div>
        <p className="text-sm font-semibold text-slate-900">{item.fileName}</p>
        <p className="mt-1 text-xs text-slate-500">
          {item.time} - {item.ocrStatus}
        </p>
      </div>
      <div className="flex gap-2">
        <button className="icon-btn" onClick={onCopy} title="Copiar texto">
          <FileText size={16} />
        </button>
        <button className="icon-btn" onClick={onOpen} title="Abrir imagem">
          <ExternalLink size={16} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
      <ScrollText size={18} />
      {text}
    </div>
  );
}
