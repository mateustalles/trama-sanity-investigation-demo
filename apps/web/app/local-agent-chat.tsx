"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { resolveAgentScope, suggestionsForScope, type AgentScope } from "./agent-scope";
import { useAgentScope } from "./use-agent-scope";

type ChatMessage = { id: string; role: "user" | "assistant" | "system"; content: string };
type Approval = { toolName: string; description: string; summary: string; arguments: Record<string, unknown> };
type WorkflowSuggestion = { operation: string; label: string; prompt: string };
type ActionWorkflow = { entityType: "action"; entityId: string; entityTitle: string; suggestions: WorkflowSuggestion[] };
type EntityWorkflow = { entityType: "plot" | "openLoop"; entityId: string; entityTitle: string; state: string; operations: Array<{ id: string; label: string; prompt: string; requiredFields: string[] }> };
type ResolvedWorkflow = ActionWorkflow | EntityWorkflow;
type AgentResult = ({ type: "message"; content: string } | { type: "approval"; approval: Approval }) & { workflow?: ActionWorkflow | null };
type ConversationSummary = { id: string; title: string; memoryScope: "currentConversation" | "sameEntity" | "relatedContext" | "global"; messageCount: number };
type PersistedMessage = { id: string; role: "user" | "assistant" | "system" | "tool"; content: string };
type MapChatContext = { plotId?: string; actionId?: string; entityType: "plot" | "openLoop" | "action"; entityId: string; title: string };
type SpeechResultEvent = { results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }> };
type BrowserSpeechRecognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};
type GuidedOperation = "recordStep" | "wait" | "complete" | "reschedule" | "rename" | "reopen";

export function LocalAgentChat() {
  const pathname = usePathname();
  if (pathname === "/poc/sanity/investigate") return null;
  return <LocalAgentChatContent />;
}

function LocalAgentChatContent() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("trama-agent");
  const [defaultModel, setDefaultModel] = useState("trama-agent");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"openai" | "ollama">("ollama");
  const [openAiConfigured, setOpenAiConfigured] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [allowWrites, setAllowWrites] = useState(false);
  const [mapContext, setMapContext] = useState<MapChatContext | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [useEntityMemory, setUseEntityMemory] = useState(true);
  const [workflow, setWorkflow] = useState<ResolvedWorkflow | null>(null);
  const [scope, setScope] = useState<AgentScope | null>(null);
  const liveScope = useAgentScope(open && !mapContext);
  const [guidedOperation, setGuidedOperation] = useState<GuidedOperation | null>(null);
  const [guidedDetail, setGuidedDetail] = useState("");
  const [guidedDeadline, setGuidedDeadline] = useState("");
  const [guidedEntityOperation, setGuidedEntityOperation] = useState<{ workflow: EntityWorkflow; operation: EntityWorkflow["operations"][number] } | null>(null);
  const [guidedEntityFields, setGuidedEntityFields] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const dictationBaseRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const audioSampleRateRef = useRef(16_000);

  async function loadRuntime() {
    return fetch("/api/local-chat").then((response) => response.json()).then((data: { available: boolean; provider?: "openai" | "ollama"; openAiConfigured?: boolean; models: string[]; defaultModel?: string; error?: string }) => {
      setAvailable(data.available);
      setRuntimeError(data.error ?? null);
      setProvider(data.provider ?? "ollama");
      setOpenAiConfigured(data.openAiConfigured === true);
      setModels(data.models);
      const preferred = data.defaultModel
        ? data.models.find((name) => name === data.defaultModel || name === `${data.defaultModel}:latest` || name.replace(/:latest$/, "") === data.defaultModel!.replace(/:latest$/, "")) ?? data.models[0]
        : data.models[0];
      if (preferred) { setDefaultModel(preferred); setModel(preferred); }
      return data;
    }).catch(() => { setAvailable(false); return null; });
  }

  useEffect(() => {
    void loadRuntime();
  }, []);

  async function updateAiSettings(body: Record<string, unknown>) {
    setSettingsBusy(true); setSettingsError("");
    try {
      const response = await fetch("/api/ai-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar as configurações de IA.");
      if (sessionId) await post({ action: "close", sessionId }).catch(() => undefined);
      setSessionId(null); setConversationId(null); setMessages([]); setApproval(null); setWorkflow(null);
      setApiKeyDraft("");
      await loadRuntime();
      setSettingsOpen(false);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally { setSettingsBusy(false); }
  }

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow;
    setSpeechSupported(Boolean(navigator.mediaDevices?.getUserMedia || speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => stopDictation();
  }, []);

  useEffect(() => {
    function openFromMap(event: Event) {
      const detail = (event as CustomEvent<MapChatContext>).detail;
      setSessionId(null);
      setConversationId(null);
      setMessages([]);
      setApproval(null);
      setWorkflow(null);
      setMapContext(detail);
      setScope({ kind: detail.entityType, entityId: detail.entityId, title: detail.title, ...(detail.plotId ? { plotId: detail.plotId } : {}), ...(detail.actionId ? { actionId: detail.actionId } : {}) });
      setOpen(true);
      const target = { entityType: detail.entityType, entityId: detail.entityId, title: detail.title, plotId: detail.plotId };
      void fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "list", conversationTarget: target }) })
        .then((response) => response.json()).then((data: { conversations?: ConversationSummary[] }) => setConversations(data.conversations ?? []));
      if ((detail.entityType === "action" || detail.entityType === "openLoop") && detail.plotId) {
        void fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workflow", conversationTarget: target }) })
          .then((response) => response.json()).then((data: { workflow?: ResolvedWorkflow }) => setWorkflow(data.workflow ?? null));
      } else if (detail.entityType === "plot") {
        void fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workflow", conversationTarget: target }) })
          .then((response) => response.json()).then((data: { workflow?: ResolvedWorkflow }) => setWorkflow(data.workflow ?? null));
      }
    }
    window.addEventListener("trama:open-agent", openFromMap);
    return () => window.removeEventListener("trama:open-agent", openFromMap);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, approval, busy]);

  useEffect(() => {
    if (!open || mapContext || !liveScope) return;
    let cancelled = false;
    setScope(liveScope);
    setWorkflow(null);
    setGuidedOperation(null);
    setGuidedDetail("");
    setGuidedDeadline("");
    setApproval(null);
    setSessionId((current) => {
      if (current) void post({ action: "close", sessionId: current }).catch(() => undefined);
      return null;
    });
    setConversationId(null);
    setMessages([]);
    const target = scopeTarget(liveScope);
    void Promise.all([
      fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "list", conversationTarget: target }) }).then((response) => response.json()) as Promise<{ conversations?: ConversationSummary[] }>,
      liveScope.kind === "action" && liveScope.plotId
        ? fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workflow", conversationTarget: { ...target, plotId: liveScope.plotId } }) }).then((response) => response.json()) as Promise<{ workflow?: ResolvedWorkflow }>
        : liveScope.kind === "plot" || liveScope.kind === "case"
          ? fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workflow", conversationTarget: target }) }).then((response) => response.json()) as Promise<{ workflow?: ResolvedWorkflow }>
          : liveScope.kind === "openLoop" && liveScope.plotId
            ? fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workflow", conversationTarget: { ...target, plotId: liveScope.plotId } }) }).then((response) => response.json()) as Promise<{ workflow?: ResolvedWorkflow }>
            : Promise.resolve({ workflow: undefined })
    ]).then(([conversationData, workflowData]) => {
      if (cancelled) return;
      setConversations(conversationData.conversations ?? []);
      setWorkflow(workflowData.workflow ?? null);
    });
    return () => { cancelled = true; };
  }, [liveScope, mapContext, open]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/local-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as AgentResult & { sessionId?: string; error?: string; contextAvailable?: boolean; conversation?: { id: string; memoryScope: ConversationSummary["memoryScope"] }; messages?: PersistedMessage[] };
    if (!response.ok) throw new Error(data.error ?? "Não foi possível conversar com o agente.");
    return data;
  }

  async function ensureSession(screenContext: Record<string, unknown>): Promise<string> {
    if (sessionId) return sessionId;
    const target = mapContext
      ? { entityType: mapContext.entityType, entityId: mapContext.entityId, title: mapContext.title }
      : typeof screenContext.plotId === "string"
        ? { entityType: typeof screenContext.actionId === "string" ? "action" : "plot", entityId: typeof screenContext.actionId === "string" ? screenContext.actionId : screenContext.plotId, title: typeof screenContext.actionTitle === "string" ? screenContext.actionTitle : "Conversa da Trama" }
        : { entityType: "workspace", entityId: "trama", title: "Conversa no Trama" };
    const data = await post({ action: "start", model, conversationId, memoryScope: useEntityMemory ? "sameEntity" : "currentConversation", conversationTarget: target });
    if (!data.sessionId) throw new Error("O agente não iniciou a sessão.");
    setSessionId(data.sessionId);
    if (data.conversation) { setConversationId(data.conversation.id); setUseEntityMemory(data.conversation.memoryScope !== "currentConversation"); }
    if (data.messages) setMessages(data.messages.filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system").map((message) => ({ id: message.id, role: message.role as ChatMessage["role"], content: message.content })));
    if (data.contextAvailable === false) setMessages((current) => [...current, {id: crypto.randomUUID(), role: "system", content: "O Sanity Context não tem fontes conectadas nesta sessão. O Trama continua disponível, mas respostas sobre documentos externos não terão essa verificação."}]);
    return data.sessionId;
  }

  async function loadConversations(target: { entityType: string; entityId: string; title: string }) {
    const response = await fetch("/api/local-chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "list", conversationTarget: target })
    });
    const data = await response.json() as { conversations?: ConversationSummary[] };
    setConversations(data.conversations ?? []);
  }

  function scopeTarget(current: AgentScope) {
    return {
      entityType: current.kind === "action" || current.kind === "openLoop" ? current.kind : current.kind === "plot" || current.kind === "case" ? "plot" : "workspace",
      entityId: current.entityId,
      title: current.title,
      ...(current.plotId ? { plotId: current.plotId } : {})
    };
  }

  function openDefaultChat() {
    setOpen(true);
    setMapContext(null);
    setScope(readCurrentScope());
  }

  function readCurrentScope(): AgentScope {
    const contextElement = document.querySelector<HTMLElement>("[data-agent-view]");
    const actionElement = document.querySelector<HTMLElement>("details[data-agent-action-id][open]");
    return resolveAgentScope({
      view: contextElement?.dataset.agentView,
      plotId: contextElement?.dataset.agentPlotId,
      plotTitle: contextElement?.dataset.agentPlotTitle,
      plotKind: contextElement?.dataset.agentPlotKind === "case" ? "case" : "plot",
      actionId: actionElement?.dataset.agentActionId,
      actionTitle: actionElement?.dataset.agentActionTitle
    });
  }

  function consume(result: AgentResult) {
    if (result.workflow !== undefined) setWorkflow(result.workflow);
    if (result.type === "approval") setApproval(result.approval);
    else setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.content || "Concluído." }]);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || approval) return;
    setInput("");
    setBusy(true);
    try {
      const contextElement = document.querySelector<HTMLElement>("[data-agent-view]");
      const actionElement = document.querySelector<HTMLElement>("details[data-agent-action-id][open]");
      const params = new URLSearchParams(window.location.search);
      const plotId = mapContext?.plotId || contextElement?.dataset.agentPlotId || params.get("plot") || params.get("parent") || undefined;
      const screenContext = {
        view: contextElement?.dataset.agentView ?? (params.has("plot") ? "plot" : params.has("parent") ? "cases" : params.get("view") === "hidden" ? "hidden" : "desk"),
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(plotId ? { plotId } : {}),
        ...((mapContext?.actionId || actionElement?.dataset.agentActionId) ? {
          actionId: mapContext?.actionId || actionElement?.dataset.agentActionId,
          actionTitle: mapContext?.title || actionElement?.dataset.agentActionTitle
        } : {})
      };
      const id = await ensureSession(screenContext);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content }]);
      consume(await post({ action: "send", sessionId: id, message: content, screenContext, allowWrites }));
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  function currentScreenContext() {
    const contextElement = document.querySelector<HTMLElement>("[data-agent-view]");
    const actionElement = document.querySelector<HTMLElement>("details[data-agent-action-id][open]");
    const params = new URLSearchParams(window.location.search);
    const plotId = mapContext?.plotId || contextElement?.dataset.agentPlotId || params.get("plot") || params.get("parent") || undefined;
    return {
      view: contextElement?.dataset.agentView ?? (params.has("plot") ? "plot" : params.has("parent") ? "cases" : params.get("view") === "hidden" ? "hidden" : "desk"),
      locale: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(plotId ? { plotId } : {}),
      ...((mapContext?.actionId || actionElement?.dataset.agentActionId) ? {
        actionId: mapContext?.actionId || actionElement?.dataset.agentActionId,
        actionTitle: mapContext?.title || actionElement?.dataset.agentActionTitle
      } : {})
    };
  }

  async function submitGuided(event: FormEvent) {
    event.preventDefault();
    if (!workflow || !guidedOperation || busy || approval) return;
    setBusy(true);
    try {
      const screenContext = currentScreenContext();
      const id = await ensureSession(screenContext);
      const deadlineAt = guidedDeadline ? new Date(guidedDeadline).toISOString() : undefined;
      const result = await post({
        action: "guided", sessionId: id, allowWrites, screenContext,
        guidedAction: { actionId: workflow.entityId, operation: guidedOperation, detail: guidedDetail.trim() || undefined, deadlineAt }
      });
      consume(result);
      setGuidedOperation(null); setGuidedDetail(""); setGuidedDeadline("");
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(approved: boolean) {
    if (!sessionId || busy) return;
    setBusy(true);
    setApproval(null);
    setModel(defaultModel);
    try {
      consume(await post({ action: "resolve", sessionId, approved }));
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    if (sessionId) void post({ action: "close", sessionId }).catch(() => undefined);
    setSessionId(null);
    setConversationId(null);
    setMessages([]);
    setApproval(null);
    setWorkflow(null);
    setScope(null);
    setGuidedOperation(null);
  }

  async function selectConversation(id: string) {
    if (sessionId) void post({ action: "close", sessionId }).catch(() => undefined);
    setSessionId(null);
    setConversationId(id || null);
    setMessages([]);
    setApproval(null);
    setWorkflow(null);
    if (!id) return;
    try {
      const response = await fetch("/api/local-chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "get", conversationId: id })
      });
      const data = await response.json() as { conversation?: { memoryScope: ConversationSummary["memoryScope"] }; messages?: PersistedMessage[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível abrir a conversa.");
      setUseEntityMemory(data.conversation?.memoryScope !== "currentConversation");
      setMessages((data.messages ?? []).filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system").map((message) => ({
        id: message.id, role: message.role as ChatMessage["role"], content: message.content
      })));
    } catch (error) {
      setMessages([{ id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]);
    }
  }

  function pcmToWav(chunks: Float32Array[], sampleRate: number) {
    const source = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let cursor = 0;
    for (const chunk of chunks) { source.set(chunk, cursor); cursor += chunk.length; }
    const targetRate = 16_000;
    const samples = Math.floor(source.length * targetRate / sampleRate);
    const wav = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(wav);
    const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVE"); write(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
    let offset = 44;
    for (let index = 0; index < samples; index++) {
      const position = index * sampleRate / targetRate;
      const lower = Math.floor(position); const upper = Math.min(lower + 1, source.length - 1); const fraction = position - lower;
      const sample = (source[lower] ?? 0) * (1 - fraction) + (source[upper] ?? 0) * fraction;
      view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 0x7fff, true); offset += 2;
    }
    return new Blob([wav], { type: "audio/wav" });
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    audioProcessorRef.current?.disconnect();
    audioContextRef.current?.close().catch(() => undefined);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioProcessorRef.current = null; audioContextRef.current = null; mediaStreamRef.current = null;
  }

  async function transcribeLocally() {
    const chunks = audioChunksRef.current;
    if (chunks.length === 0) return;
    setTranscribing(true);
    try {
      const response = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: pcmToWav(chunks, audioSampleRateRef.current) });
      const data = await response.json() as { transcript?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível transcrever o áudio.");
      setInput([dictationBaseRef.current, data.transcript?.trim()].filter(Boolean).join(" "));
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]);
    } finally { setTranscribing(false); }
  }

  async function toggleDictation() {
    if (listening) {
      setListening(false);
      const hasLocalAudio = audioChunksRef.current.length > 0;
      stopDictation();
      if (hasLocalAudio) await transcribeLocally();
      return;
    }
    dictationBaseRef.current = input.trim();
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const processor = context.createScriptProcessor(4096, 1, 1);
        audioChunksRef.current = [];
        processor.onaudioprocess = (event) => audioChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        source.connect(processor); processor.connect(context.destination);
        mediaStreamRef.current = stream; audioContextRef.current = context; audioProcessorRef.current = processor; audioSampleRateRef.current = context.sampleRate;
        setListening(true);
        return;
      } catch { /* use the browser recognizer when microphone capture is unavailable */ }
    }
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      setInput([dictationBaseRef.current, transcript].filter(Boolean).join(" "));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); } catch { setListening(false); recognitionRef.current = null; }
  }

  return <>
    <button className="agentLauncher" onClick={openDefaultChat} aria-label="Abrir agente do Trama"><span>✦</span><b>Conversar</b></button>
    {open && <section className="agentPanel" aria-label="Agente do Trama">
      <header><div><small>{provider === "openai" ? "OPENAI · BYOK" : "AGENTE LOCAL"}</small><strong>Converse com o Trama</strong></div><button onClick={() => setOpen(false)} aria-label="Fechar">×</button></header>
      <div className="agentToolbar">
        <label>Modelo<select value={model} disabled={Boolean(sessionId)} onChange={(event) => setModel(event.target.value)}>{models.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label className="agentWriteToggle"><input type="checkbox" checked={allowWrites} onChange={(event) => setAllowWrites(event.target.checked)} /><span>Permitir alterações</span></label>
        <button type="button" onClick={() => { setSettingsError(""); setSettingsOpen(true); }}>Configurar IA</button>
        <button onClick={() => void newChat()}>Nova conversa</button>
      </div>
      {settingsOpen && <aside className="aiSettings" aria-label="Configurações de IA">
        <div><small>PROVEDOR DO AGENTE</small><strong>Como você quer usar a IA?</strong><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Fechar configurações">×</button></div>
        <section className={provider === "openai" ? "selected" : ""}><b>OpenAI</b><p>Use sua própria API key. A chave é validada, criptografada e nunca fica disponível ao JavaScript da página.</p>{openAiConfigured ? <><span>✓ API key configurada</span><button type="button" disabled={settingsBusy} onClick={() => void updateAiSettings({ action: "selectProvider", provider: "openai", model })}>Usar OpenAI</button><button type="button" className="quiet" disabled={settingsBusy} onClick={() => void updateAiSettings({ action: "removeOpenAi" })}>Remover chave</button></> : <form onSubmit={(event) => { event.preventDefault(); void updateAiSettings({ action: "saveOpenAi", apiKey: apiKeyDraft, model: model.startsWith("gpt-") ? model : "gpt-5.6-terra" }); }}><label>OpenAI API key<input required type="password" autoComplete="off" placeholder="sk-…" value={apiKeyDraft} onChange={(event) => setApiKeyDraft(event.target.value)} /></label><button disabled={settingsBusy}>{settingsBusy ? "Validando…" : "Validar e usar OpenAI"}</button></form>}</section>
        <section className={provider === "ollama" ? "selected" : ""}><b>Ollama local</b><p>Executa na máquina onde o Trama está hospedado. Não é necessário para usar OpenAI.</p><button type="button" disabled={settingsBusy} onClick={() => void updateAiSettings({ action: "selectProvider", provider: "ollama" })}>Usar Ollama</button></section>
        {settingsError && <p className="settingsError">{settingsError}</p>}
      </aside>}
      <div className="conversationToolbar"><label>Conversa<select value={conversationId ?? ""} onChange={(event) => void selectConversation(event.target.value)}><option value="">Nova conversa</option>{conversations.map((conversation) => <option value={conversation.id} key={conversation.id}>{conversation.title} · {conversation.messageCount}</option>)}</select></label><label className="agentWriteToggle"><input type="checkbox" checked={useEntityMemory} onChange={(event) => setUseEntityMemory(event.target.checked)} disabled={Boolean(sessionId)} /><span>Usar histórico deste item</span></label></div>
      {scope && <div className="agentMapContext"><span>{scope.kind === "action" ? "Ação em foco" : scope.kind === "openLoop" ? "Ponta Solta em foco" : scope.kind === "case" ? "Caso em foco" : scope.kind === "plot" ? "Trama em foco" : scope.kind === "calendar" ? "Escopo atual" : "Visão atual"}</span><strong>{scope.title}</strong>{mapContext && <button type="button" onClick={() => { setMapContext(null); setWorkflow(null); const current = readCurrentScope(); setScope(current); }}>Usar tela inteira</button>}</div>}
      <div className="agentMessages">
        {available === false && <div className="agentNotice error" role="status">{runtimeError ?? "O Ollama não está disponível. Configure sua OpenAI API key ou abra o aplicativo Ollama."}</div>}
        {messages.length === 0 && available !== false && <div className="agentWelcome"><span>✦</span><strong>O que não pode cair no esquecimento?</strong><p>Posso consultar suas Tramas, organizar prioridades e registrar atualizações com sua confirmação.</p></div>}
        {messages.map((message) => <article className={`agentMessage ${message.role}`} key={message.id}><small>{message.role === "user" ? "Você" : message.role === "assistant" ? "Trama" : "Aviso"}</small><p>{message.content}</p></article>)}
        {approval && <article className="agentApproval"><small>CONFIRMAÇÃO NECESSÁRIA</small><strong>{approval.description}</strong><p style={{ whiteSpace: "pre-line" }}>{approval.summary}</p><details><summary>Ver dados técnicos</summary><code>{JSON.stringify(approval.arguments, null, 2)}</code></details><div><button onClick={() => void resolve(false)}>Não executar</button><button className="confirm" onClick={() => void resolve(true)}>Confirmar alteração</button></div></article>}
        {workflow?.entityType === "action" && !approval && <aside className="workflowSuggestions" aria-label={`Ações disponíveis para ${workflow.entityTitle}`}><small>MODO GUIADO</small><strong>O que você quer fazer com “{workflow.entityTitle}”?</strong><div>{workflow.suggestions.map((suggestion) => <button type="button" className={guidedOperation === suggestion.operation ? "selected" : ""} key={suggestion.operation} onClick={() => { setGuidedOperation(suggestion.operation as GuidedOperation); setGuidedDetail(""); setGuidedDeadline(""); }}>{suggestion.label}</button>)}</div></aside>}
        {scope && scope.kind !== "action" && !approval && <aside className="workflowSuggestions" aria-label={`Opções para ${scope.title}`}><small>OPÇÕES DESTE CONTEXTO</small><strong>O que você quer fazer em “{scope.title}”?</strong><div>{workflow && workflow.entityType !== "action" ? workflow.operations.map((operation) => <button type="button" key={operation.id} onClick={() => { setGuidedEntityFields({}); setGuidedEntityOperation({ workflow, operation }); }}>{operation.label}</button>) : suggestionsForScope(scope).map((suggestion) => <button type="button" key={suggestion.id} onClick={() => setInput(suggestion.prompt)}>{suggestion.label}</button>)}</div></aside>}
        {guidedEntityOperation && !approval && <form className="guidedActionForm" onSubmit={(event) => { event.preventDefault(); void (async () => { setBusy(true); try { const current = currentScreenContext(); const id = await ensureSession(current); const target = guidedEntityOperation.workflow; consume(await post({ action: "guidedEntity", sessionId: id, guidedEntity: { entityType: target.entityType, entityId: target.entityId, operationId: guidedEntityOperation.operation.id, fields: guidedEntityFields, ...(scope?.plotId ? { plotId: scope.plotId } : {}) } })); setGuidedEntityOperation(null); } catch (error) { setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]); } finally { setBusy(false); } })(); }}><small>COMPLETE SOMENTE O NECESSÁRIO</small>{guidedEntityOperation.operation.requiredFields.map((field) => field === "visibility" ? <label key={field}>Visibilidade<select value={guidedEntityFields[field] ?? "public"} onChange={(event) => setGuidedEntityFields((current) => ({ ...current, [field]: event.target.value }))}><option value="public">Mostrar na Mesa</option><option value="private">Ocultar da Mesa</option></select></label> : field === "status" ? <label key={field}>Resultado<select value={guidedEntityFields[field] ?? "resolved"} onChange={(event) => setGuidedEntityFields((current) => ({ ...current, [field]: event.target.value }))}><option value="resolved">Resolvida</option><option value="dismissed">Não é mais relevante</option></select></label> : <label key={field}>{field === "centralQuestion" ? "Pergunta central" : field === "goal" ? "Objetivo" : field === "resolution" ? "Como foi encerrada?" : "Título"}<textarea required={field !== "visibility" && field !== "status"} value={guidedEntityFields[field] ?? ""} onChange={(event) => setGuidedEntityFields((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<div><button type="button" onClick={() => setGuidedEntityOperation(null)}>Cancelar</button><button type="submit" className="confirm" disabled={busy || !allowWrites}>Revisar alteração</button></div>{!allowWrites && <p>Ative “Permitir alterações” para continuar.</p>}</form>}
        {workflow?.entityType === "action" && guidedOperation && !approval && <form className="guidedActionForm" onSubmit={submitGuided}>
          <small>COMPLETE SOMENTE O NECESSÁRIO</small>
          {guidedOperation === "recordStep" && <><label>O que aconteceu?<textarea required value={guidedDetail} onChange={(event) => setGuidedDetail(event.target.value)} /></label><p>O estado e o prazo atuais serão mantidos.</p></>}
          {guidedOperation === "wait" && <><label>O que aconteceu?<textarea required value={guidedDetail} onChange={(event) => setGuidedDetail(event.target.value)} /></label><label>Até quando aguardar?<input required type="datetime-local" value={guidedDeadline} onChange={(event) => setGuidedDeadline(event.target.value)} /></label></>}
          {guidedOperation === "complete" && <label>Qual foi o resultado?<textarea required value={guidedDetail} onChange={(event) => setGuidedDetail(event.target.value)} /></label>}
          {guidedOperation === "reschedule" && <label>Novo prazo de conclusão<input required type="datetime-local" value={guidedDeadline} onChange={(event) => setGuidedDeadline(event.target.value)} /></label>}
          {guidedOperation === "rename" && <label>Novo nome da ação<input required value={guidedDetail} onChange={(event) => setGuidedDetail(event.target.value)} /></label>}
          {guidedOperation === "reopen" && <label>Novo prazo de conclusão<input required type="datetime-local" value={guidedDeadline} onChange={(event) => setGuidedDeadline(event.target.value)} /></label>}
          <div><button type="button" onClick={() => setGuidedOperation(null)}>Cancelar</button><button type="submit" className="confirm" disabled={busy || !allowWrites}>Revisar alteração</button></div>
          {!allowWrites && <p>Ative “Permitir alterações” para continuar.</p>}
        </form>}
        {busy && <div className="agentThinking"><i /><i /><i /><span>Analisando o contexto…</span></div>}
        <div ref={endRef} />
      </div>
      <form className="agentComposer" onSubmit={send}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Conte o que aconteceu ou pergunte o que precisa de atenção…" disabled={busy || Boolean(approval) || transcribing} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />{speechSupported && <button type="button" className={`dictationButton${listening ? " listening" : ""}`} onClick={() => void toggleDictation()} disabled={busy || Boolean(approval) || transcribing} aria-label={listening ? "Parar gravação" : "Falar para transcrever"}>{listening ? "■" : "🎙"}<span>{listening ? "Parar" : transcribing ? "Transcrevendo…" : "Falar"}</span></button>}<button disabled={busy || Boolean(approval) || transcribing || !input.trim()}>Enviar</button></form>
      <footer>{provider === "openai" ? "OpenAI com sua API key" : "Ollama local"} · ferramentas do Trama via MCP</footer>
    </section>}
  </>;
}
