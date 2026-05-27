"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Shield, Terminal, Cpu, Copy, Check, Zap,
  Target, Search, BookOpen, AlertTriangle, Wifi,
  Upload, X, RefreshCw, Trash2, Crosshair,
  ChevronDown, FileText, Code2, Loader2, SquareSlash,
  FlaskConical, Bot, Image as ImageIcon, Plus, MessageSquare,
  Menu, ChevronRight, ChevronUp, Settings, Key, Lock
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Mode = "chat" | "research" | "agentic";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: Mode;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  mode: Mode;
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface NimModel {
  id: string;
  label: string;
  provider: string;
  speed: "fast" | "medium" | "slow";
  ctx: string;
}

interface UploadedFile {
  id: string;
  name: string;
  content: string;
  type: string;
  sizeKb: number;
  previewUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MODE_META: Record<Mode, { label: string; icon: React.ElementType; color: string; desc: string }> = {
  chat:     { label: "Chat",     icon: Terminal,     color: "#ef4444", desc: "Direct red team Q&A" },
  research: { label: "Research", icon: FlaskConical, color: "#f59e0b", desc: "Structured threat intel report" },
  agentic:  { label: "Agentic",  icon: Bot,          color: "#a855f7", desc: "Mission-style step-by-step execution" },
};

const SPEED_COLOR: Record<string, string> = { fast: "#22c55e", medium: "#f59e0b", slow: "#ef4444" };

const QUICK_PROMPTS = [
  { icon: Target,        label: "AD Attack Path",  prompt: "Walk me through a typical Active Directory attack path from initial foothold to Domain Admin — include specific tools and MITRE ATT&CK technique IDs." },
  { icon: Search,        label: "OSINT Recon",      prompt: "Give me a comprehensive OSINT recon methodology for a red team engagement including passive recon, FOCA, Shodan, and social engineering vectors." },
  { icon: Terminal,      label: "Linux Priv Esc",   prompt: "What are the most effective Linux privilege escalation techniques to enumerate post-compromise? Include SUID, capabilities, cron, and sudo misconfigs." },
  { icon: BookOpen,      label: "CTF PWN",          prompt: "Explain the methodology for a classic buffer overflow pwn CTF challenge — from checksec and GDB analysis to writing the exploit with pwntools." },
  { icon: Wifi,          label: "SSRF Exploits",    prompt: "Explain SSRF attack vectors in depth — how to identify them, common metadata endpoint targets, blind SSRF techniques, and cloud-specific payloads." },
  { icon: AlertTriangle, label: "EDR Evasion",      prompt: "Explain how modern EDR solutions detect common offensive techniques and what living-off-the-land strategies red teamers use to minimize their footprint." },
];

const STORAGE_KEY = "azmoki_v2_sessions";
const MSG_COLLAPSE_THRESHOLD = 280;

// ─────────────────────────────────────────────────────────────────────────────
// Session Storage Utilities
// ─────────────────────────────────────────────────────────────────────────────
function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function saveSessions(sessions: ChatSession[]): void {
  try {
    const trimmed = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}
function generateTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 55 ? clean.slice(0, 55) + "…" : clean;
}
function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
function newSessionId() { return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

// ─────────────────────────────────────────────────────────────────────────────
// Auth Overlay Component
// ─────────────────────────────────────────────────────────────────────────────
function AuthOverlay({ onVerified }: { onVerified: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onVerified(code);
      } else {
        setError(data.error || "Access Denied");
      }
    } catch {
      setError("Server connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-0)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(220,38,38,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(220,38,38,0.03) 1px, transparent 1px)`, backgroundSize: "44px 44px" }} />
      <div style={{ position: "relative", zIndex: 10, background: "var(--bg-card)", padding: "2rem", borderRadius: "16px", border: "1px solid var(--border-red)", boxShadow: "0 0 50px rgba(220,38,38,0.1)", width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "15px", background: "linear-gradient(135deg, rgba(220,38,38,0.2), rgba(220,38,38,0.05))", border: "1px solid rgba(220,38,38,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.2rem" }}>
          <Shield size={28} color="#ef4444" />
        </div>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.2rem", color: "var(--txt-0)", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>RESTRICTED ACCESS</h2>
        <p style={{ fontSize: "0.75rem", color: "var(--txt-2)", marginBottom: "1.5rem" }}>Enter deployment access code to continue.</p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="ACCESS CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ width: "100%", background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "8px", padding: "0.8rem 1rem", color: "var(--txt-0)", fontFamily: "var(--mono)", fontSize: "0.9rem", textAlign: "center", outline: "none", marginBottom: "1rem" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--border-red)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-dim)")}
          />
          {error && <div style={{ color: "#ef4444", fontSize: "0.75rem", fontFamily: "var(--mono)", marginBottom: "1rem" }}>⚠ {error}</div>}
          <button type="submit" disabled={!code || loading} style={{ width: "100%", padding: "0.8rem", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #ef4444, #b91c1c)", color: "#fff", fontWeight: 600, cursor: code && !loading ? "pointer" : "not-allowed", fontFamily: "var(--mono)", letterSpacing: "0.05em" }}>
            {loading ? "AUTHENTICATING..." : "AUTHORIZE"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Modal
// ─────────────────────────────────────────────────────────────────────────────
function SettingsModal({ 
  open, onClose, accessCode, onSaveAccessCode, customKey, onSaveCustomKey 
}: { 
  open: boolean; onClose: () => void; 
  accessCode: string; onSaveAccessCode: (s: string) => void;
  customKey: string; onSaveCustomKey: (s: string) => void;
}) {
  const [tempKey, setTempKey] = useState(customKey);
  const [tempCode, setTempCode] = useState(accessCode);

  useEffect(() => { setTempKey(customKey); setTempCode(accessCode); }, [open, customKey, accessCode]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-red)", borderRadius: "12px", width: "100%", maxWidth: 450, padding: "1.5rem", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "var(--txt-2)", cursor: "pointer" }}><X size={16} /></button>
        
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--txt-0)", marginBottom: "1.5rem" }}>
          <Settings size={18} color="#ef4444" /> Settings
        </h2>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", fontFamily: "var(--mono)", color: "var(--txt-1)", marginBottom: "0.5rem" }}>
            <Key size={12} /> Custom NVIDIA API Key (Optional)
          </label>
          <input 
            type="password" placeholder="nvapi-..." value={tempKey} onChange={e => setTempKey(e.target.value)}
            style={{ width: "100%", background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "8px", padding: "0.6rem 0.8rem", color: "var(--txt-0)", fontFamily: "var(--mono)", fontSize: "0.8rem", outline: "none" }}
          />
          <p style={{ fontSize: "0.65rem", color: "var(--txt-2)", marginTop: "0.4rem" }}>Bypass server defaults and use your own NVIDIA NIM key.</p>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", fontFamily: "var(--mono)", color: "var(--txt-1)", marginBottom: "0.5rem" }}>
            <Lock size={12} /> Access Code
          </label>
          <input 
            type="password" value={tempCode} onChange={e => setTempCode(e.target.value)}
            style={{ width: "100%", background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "8px", padding: "0.6rem 0.8rem", color: "var(--txt-0)", fontFamily: "var(--mono)", fontSize: "0.8rem", outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button onClick={onClose} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--border-dim)", background: "transparent", color: "var(--txt-0)", cursor: "pointer", fontFamily: "var(--mono)", fontSize: "0.8rem" }}>Cancel</button>
          <button onClick={() => { onSaveCustomKey(tempKey); onSaveAccessCode(tempCode); onClose(); }} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontFamily: "var(--mono)", fontSize: "0.8rem" }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming Hook
// ─────────────────────────────────────────────────────────────────────────────
function useStreamer() {
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (opts: {
    messages: Message[];
    model: string; mode: Mode; fileContext?: string; assistantId: string;
    accessCode: string; customApiKey: string;
    onChunk: (id: string, acc: string) => void;
    onError: (id: string, err: string) => void;
    onDone: () => void;
    onAuthError: () => void;
  }) => {
    const { messages, model, mode, fileContext, assistantId, accessCode, customApiKey, onChunk, onError, onDone, onAuthError } = opts;
    abortRef.current = new AbortController();
    setIsLoading(true);
    let accumulated = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-access-code": accessCode,
          "x-custom-api-key": customApiKey
        },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          model, mode, fileContext,
        }),
        signal: abortRef.current.signal,
      });

      if (res.status === 401) { onAuthError(); throw new Error("Unauthorized Access Code"); }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const raw = t.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const p = JSON.parse(raw);
            if (p.error) { accumulated = `⚠️ **Error**\n\n\`\`\`\n${p.error}\n\`\`\``; }
            else { const d = p.choices?.[0]?.delta?.content; if (typeof d === "string") accumulated += d; }
            onChunk(assistantId, accumulated);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") { onDone(); return; }
      onError(assistantId, `⚠️ **Error**\n\n${(err as Error)?.message ?? "Connection failed"}`);
    } finally {
      setIsLoading(false);
      onDone();
    }
  }, []);

  const stop = useCallback(() => { abortRef.current?.abort(); setIsLoading(false); }, []);
  return { isLoading, stream, stop };
}

// ─────────────────────────────────────────────────────────────────────────────
// useModels Hook
// ─────────────────────────────────────────────────────────────────────────────
function useModels(accessCode: string, customApiKey: string, onAuthError: () => void) {
  const [models, setModels] = useState<NimModel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModels = useCallback(() => {
    if (!accessCode && !customApiKey) { setLoading(false); return; }
    setLoading(true);
    fetch("/api/models", {
      headers: {
        "x-access-code": accessCode,
        "x-custom-api-key": customApiKey
      }
    })
      .then(r => { if (r.status === 401) { onAuthError(); throw new Error("Unauthorized"); } return r.json(); })
      .then(d => {
        setModels(d.models ?? []);
        if (d.source !== "unauthorized") {
          localStorage.setItem("nim_models_v2", JSON.stringify(d.models ?? []));
          localStorage.setItem("nim_models_ts", Date.now().toString());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessCode, customApiKey, onAuthError]);

  useEffect(() => {
    const cached = localStorage.getItem("nim_models_v2");
    const ts = localStorage.getItem("nim_models_ts");
    if (cached && ts && Date.now() - Number(ts) < 3_600_000 && accessCode) {
      setModels(JSON.parse(cached));
      setLoading(false);
    } else {
      fetchModels();
    }
  }, [fetchModels, accessCode]);

  const refresh = useCallback(() => {
    localStorage.removeItem("nim_models_v2");
    localStorage.removeItem("nim_models_ts");
    fetchModels();
  }, [fetchModels]);

  return { models, loading, refresh };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents (CopyButton, ModelSelector, ModeToggle, FileChip, MessageBubble...)
// ─────────────────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ position: "absolute", top: "0.45rem", right: "0.45rem", display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.2rem 0.45rem", background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.22)", borderRadius: "5px", cursor: "pointer", color: "#ef4444", fontSize: "0.68rem", fontFamily: "var(--mono)" }}>
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "copied" : "copy"}
    </button>
  );
}

function ModelSelector({ models, selected, onSelect, loading, onRefresh }: { models: NimModel[]; selected: string; onSelect: (id: string) => void; loading: boolean; onRefresh: () => void; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = models.find(m => m.id === selected);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const grouped: Record<string, NimModel[]> = {};
  for (const m of models) { if (!grouped[m.provider]) grouped[m.provider] = []; grouped[m.provider].push(m); }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.7rem", background: "var(--bg-2)", border: "1px solid var(--border-red)", borderRadius: "8px", cursor: "pointer", color: "var(--txt-0)", fontSize: "0.78rem", fontFamily: "var(--mono)", minWidth: 180 }}>
        <Cpu size={12} color="#ef4444" />
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loading ? "Loading…" : sel?.label ?? "Select Model"}</span>
        {sel && <span style={{ width: 7, height: 7, borderRadius: "50%", background: SPEED_COLOR[sel.speed], flexShrink: 0 }} />}
        <ChevronDown size={12} color="var(--txt-2)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--bg-2)", border: "1px solid var(--border-red)", borderRadius: "10px", width: 320, maxHeight: 400, overflowY: "auto", zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", padding: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.3rem 0.5rem 0.5rem", borderBottom: "1px solid var(--border-dim)", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.65rem", fontFamily: "var(--mono)", color: "var(--txt-2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>NVIDIA NIM Models</span>
            <button onClick={onRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-2)", display: "flex" }}><RefreshCw size={11} className={loading ? "spin" : ""} /></button>
          </div>
          {Object.entries(grouped).map(([provider, pModels]) => (
            <div key={provider}>
              <div style={{ padding: "0.25rem 0.5rem", fontSize: "0.62rem", fontFamily: "var(--mono)", color: "var(--txt-2)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "0.3rem" }}>{provider}</div>
              {pModels.map(m => (
                <button key={m.id} onClick={() => { onSelect(m.id); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "0.45rem 0.6rem", borderRadius: "7px", cursor: "pointer", border: "none", background: selected === m.id ? "var(--red-lo)" : "transparent", display: "flex", alignItems: "center", gap: "0.6rem" }}
                  onMouseEnter={e => { if (selected !== m.id) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={e => { if (selected !== m.id) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.8rem", color: selected === m.id ? "#ef4444" : "var(--txt-0)", fontWeight: selected === m.id ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                    <div style={{ fontSize: "0.64rem", color: "var(--txt-2)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.id}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.6rem", color: SPEED_COLOR[m.speed], fontFamily: "var(--mono)" }}>{m.speed}</span>
                    <span style={{ fontSize: "0.58rem", color: "var(--txt-2)", fontFamily: "var(--mono)" }}>{m.ctx}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div style={{ display: "flex", gap: "0.25rem", background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "8px", padding: "0.2rem" }}>
      {(["chat", "research", "agentic"] as Mode[]).map(m => {
        const meta = MODE_META[m]; const Icon = meta.icon; const active = m === mode;
        return (
          <button key={m} onClick={() => onChange(m)} title={meta.desc} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.28rem 0.55rem", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.73rem", fontWeight: 500, background: active ? "rgba(255,255,255,0.08)" : "transparent", color: active ? meta.color : "var(--txt-2)", transition: "all 0.15s" }}>
            <Icon size={12} color={active ? meta.color : "var(--txt-2)"} /> {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function FileChip({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const Icon = file.type === "pdf" ? FileText : file.type === "image" ? ImageIcon : Code2;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0.45rem 0.2rem 0.3rem", background: "var(--bg-3)", border: "1px solid var(--border-red)", borderRadius: "6px", fontSize: "0.72rem", fontFamily: "var(--mono)", color: "var(--txt-1)", maxWidth: 230 }}>
      {file.previewUrl ? <img src={file.previewUrl} alt={file.name} style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} /> : <Icon size={11} color="#ef4444" style={{ flexShrink: 0 }} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
      <span style={{ color: "var(--txt-2)", flexShrink: 0 }}>{file.sizeKb}kb</span>
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-2)", display: "flex", padding: 0 }}><X size={11} /></button>
    </div>
  );
}

function UserMessageContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > MSG_COLLAPSE_THRESHOLD;
  if (!isLong) return <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>;
  return (
    <div>
      <span style={{ whiteSpace: "pre-wrap" }}>{expanded ? content : content.slice(0, MSG_COLLAPSE_THRESHOLD) + "…"}</span>
      <button onClick={() => setExpanded(e => !e)} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", marginTop: "0.5rem", background: "none", border: "none", cursor: "pointer", color: "var(--blue-hi)", fontSize: "0.75rem", padding: 0, fontFamily: "var(--font)" }}>
        {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronRight size={12} /> Show full message</>}
      </button>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const modeColor = MODE_META[msg.mode]?.color ?? "#ef4444";
  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: "0.75rem", alignItems: "flex-start" }}>
      <div style={{ width: 30, height: 30, borderRadius: "7px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: "0.1rem", background: isUser ? "var(--blue-lo)" : `${modeColor}1a`, border: `1px solid ${isUser ? "var(--blue-border)" : modeColor + "44"}` }}>
        {isUser ? <span style={{ fontSize: "0.58rem", fontFamily: "var(--mono)", color: "var(--blue-hi)", fontWeight: 700 }}>YOU</span> : <Shield size={13} color={modeColor} />}
      </div>
      <div style={{ flex: 1, maxWidth: "88%" }}>
        {isUser ? (
          <div style={{ background: "linear-gradient(135deg, var(--blue-lo), rgba(59,130,246,0.05))", border: "1px solid var(--blue-border)", borderRadius: "4px 12px 12px 12px", padding: "0.7rem 1rem", fontSize: "0.875rem", lineHeight: 1.65, color: "var(--txt-0)" }}>
            <UserMessageContent content={msg.content} />
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", border: `1px solid ${modeColor}33`, borderRadius: "12px 4px 12px 12px", padding: "0.8rem 1.1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.55rem", paddingBottom: "0.45rem", borderBottom: `1px solid ${modeColor}22` }}>
              <Zap size={10} color={modeColor} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: modeColor, letterSpacing: "0.12em", textTransform: "uppercase" }}>AZMOKI · {MODE_META[msg.mode]?.label?.toUpperCase() ?? "CHAT"}</span>
            </div>
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ({ children, ...props }: any) => ( <div style={{ position: "relative" }}> <pre {...props}>{children}</pre> <CopyButton text={String((children as any)?.props?.children ?? "")} /> </div> ) }}>
                {msg.content || "▍"}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ mode }: { mode: Mode }) {
  const color = MODE_META[mode].color;
  return (
    <div className="anim-up" style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
      <div style={{ width: 30, height: 30, borderRadius: "7px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}1a`, border: `1px solid ${color}44` }}><Shield size={13} color={color} /></div>
      <div style={{ background: "var(--bg-card)", border: `1px solid ${color}33`, borderRadius: "12px 4px 12px 12px", padding: "0.8rem 1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: color, animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
        <span style={{ fontSize: "0.7rem", fontFamily: "var(--mono)", color: "var(--txt-2)", marginLeft: "0.2rem" }}>
          {mode === "research" ? "researching…" : mode === "agentic" ? "planning mission…" : "analyzing…"}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────
function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, open }: { sessions: ChatSession[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; open: boolean; }) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div style={{ width: open ? 245 : 0, flexShrink: 0, overflow: "hidden", transition: "width 0.25s ease", borderRight: open ? "1px solid var(--border-red)" : "none", background: "rgba(8,11,15,0.97)", display: "flex", flexDirection: "column", position: "relative", zIndex: 15 }}>
      <div style={{ padding: "0.75rem 0.65rem 0.5rem", minWidth: 245 }}>
        <button onClick={onNew} style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.75rem", borderRadius: "8px", background: "linear-gradient(135deg, rgba(220,38,38,0.2), rgba(220,38,38,0.08))", border: "1px solid rgba(220,38,38,0.35)", cursor: "pointer", color: "var(--txt-0)", fontSize: "0.8rem", fontWeight: 500, transition: "all 0.15s", marginBottom: "0.75rem" }} onMouseEnter={e => (e.currentTarget.style.background = "linear-gradient(135deg, rgba(220,38,38,0.3), rgba(220,38,38,0.12))")} onMouseLeave={e => (e.currentTarget.style.background = "linear-gradient(135deg, rgba(220,38,38,0.2), rgba(220,38,38,0.08))")}>
          <Plus size={14} color="#ef4444" /> New Chat
        </button>
        <div style={{ fontSize: "0.6rem", fontFamily: "var(--mono)", color: "var(--txt-2)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.4rem", paddingLeft: "0.25rem" }}>Recent Chats</div>
        <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 140px)" }}>
          {sorted.length === 0 ? <div style={{ padding: "1rem 0.5rem", textAlign: "center", color: "var(--txt-2)", fontSize: "0.75rem", fontFamily: "var(--mono)" }}>No chats yet</div> : sorted.map(s => {
            const isActive = s.id === activeId; const ModeIcon = MODE_META[s.mode]?.icon ?? MessageSquare; const modeColor = MODE_META[s.mode]?.color ?? "#ef4444";
            return (
              <div key={s.id} onClick={() => onSelect(s.id)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.6rem", borderRadius: "8px", cursor: "pointer", background: isActive ? "rgba(220,38,38,0.1)" : "transparent", border: isActive ? "1px solid rgba(220,38,38,0.2)" : "1px solid transparent", marginBottom: "0.2rem", transition: "all 0.15s", position: "relative" }} onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget.querySelector(".del-btn") as HTMLElement | null)?.style.setProperty("opacity", "1"); }} onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget.querySelector(".del-btn") as HTMLElement | null)?.style.setProperty("opacity", "0"); }}>
                <div style={{ width: 24, height: 24, borderRadius: "6px", background: `${modeColor}15`, border: `1px solid ${modeColor}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ModeIcon size={11} color={modeColor} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.77rem", color: isActive ? "#ef4444" : "var(--txt-0)", fontWeight: isActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ fontSize: "0.62rem", color: "var(--txt-2)", fontFamily: "var(--mono)" }}>{timeAgo(s.updatedAt)} · {s.messages.length / 2 | 0} msgs</div>
                </div>
                <button className="del-btn" onClick={e => { e.stopPropagation(); onDelete(s.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-2)", display: "flex", opacity: 0, transition: "opacity 0.15s", flexShrink: 0, padding: "0.1rem" }} onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={e => (e.currentTarget.style.color = "var(--txt-2)")}><Trash2 size={12} /></button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const [accessCode, setAccessCode] = useState<string>("");
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load auth state from localStorage
  useEffect(() => {
    setAccessCode(localStorage.getItem("azmoki_access_code") || "");
    setCustomApiKey(localStorage.getItem("azmoki_custom_api_key") || "");
    
    // Automatically check auth if code exists (or no code needed)
    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: localStorage.getItem("azmoki_access_code") || "" })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        setIsAuthChecking(false);
      } else {
        localStorage.removeItem("azmoki_access_code");
        setAccessCode("");
        setIsAuthChecking(false);
      }
    })
    .catch(() => setIsAuthChecking(false));
  }, []);

  const handleVerified = (code: string) => {
    localStorage.setItem("azmoki_access_code", code);
    setAccessCode(code);
    setIsAuthChecking(false);
  };

  const handleAuthError = useCallback(() => {
    localStorage.removeItem("azmoki_access_code");
    setAccessCode("");
  }, []);

  const { isLoading, stream, stop } = useStreamer();
  const { models, loading: modelsLoading, refresh: refreshModels } = useModels(accessCode, customApiKey, handleAuthError);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mode, setMode] = useState<Mode>("chat");
  const [selectedModel, setSelectedModel] = useState("meta/llama-3.1-8b-instruct");
  const [input, setInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSessions(loadSessions()); }, []);
  useEffect(() => { if (models.length > 0 && !models.find(m => m.id === selectedModel)) setSelectedModel(models[0].id); }, [models, selectedModel]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [sessions, isLoading, activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];
  const isEmpty = messages.length === 0;
  const modeColor = MODE_META[mode].color;

  const createNewSession = useCallback(() => { setActiveSessionId(null); setUploadedFiles([]); setInput(""); }, []);
  const switchSession = useCallback((id: string) => { const s = sessions.find(x => x.id === id); if (s) { setMode(s.mode); setSelectedModel(s.model); } setActiveSessionId(id); setUploadedFiles([]); }, [sessions]);
  const deleteSession = useCallback((id: string) => { setSessions(prev => { const next = prev.filter(s => s.id !== id); saveSessions(next); return next; }); if (activeSessionId === id) setActiveSessionId(null); }, [activeSessionId]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let sid = activeSessionId; let sessionMessages = messages;
    if (!sid) {
      sid = newSessionId();
      const newSession: ChatSession = { id: sid, title: generateTitle(trimmed), messages: [], mode, model: selectedModel, createdAt: Date.now(), updatedAt: Date.now() };
      sessionMessages = [];
      setSessions(prev => { const next = [newSession, ...prev]; saveSessions(next); return next; });
      setActiveSessionId(sid);
    }

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: trimmed, mode };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", mode };
    const historyForRequest = [...sessionMessages, userMsg];

    const finalSid = sid;
    setSessions(prev => prev.map(s => {
      if (s.id !== finalSid) return s;
      const newMsgs = [...s.messages, userMsg, assistantMsg];
      const updated = { ...s, messages: newMsgs, title: s.messages.length === 0 ? generateTitle(trimmed) : s.title, updatedAt: Date.now() };
      saveSessions(prev.map(x => x.id === finalSid ? updated : x)); return updated;
    }));

    const fileContext = uploadedFiles.length > 0 ? uploadedFiles.map(f => `### File: ${f.name} (${f.type})\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n---\n\n") : undefined;

    await stream({
      messages: historyForRequest, model: selectedModel, mode, fileContext, assistantId,
      accessCode, customApiKey,
      onChunk: (id, chunk) => {
        setSessions(prev => {
          const next = prev.map(s => {
            if (s.id !== finalSid) return s;
            return { ...s, messages: s.messages.map(m => m.id === id ? { ...m, content: chunk } : m), updatedAt: Date.now() };
          });
          saveSessions(next); return next;
        });
      },
      onError: (id, errMsg) => {
        setSessions(prev => {
          const next = prev.map(s => {
            if (s.id !== finalSid) return s;
            return { ...s, messages: s.messages.map(m => m.id === id ? { ...m, content: errMsg } : m) };
          });
          saveSessions(next); return next;
        });
      },
      onDone: () => {},
      onAuthError: handleAuthError,
    });
  }, [input, isLoading, activeSessionId, messages, mode, selectedModel, uploadedFiles, stream, accessCode, customApiKey, handleAuthError]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const autoResize = () => { const ta = textareaRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; } };

  const processFile = useCallback(async (file: File) => {
    setUploadError(""); setIsUploading(true);
    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
        setUploadedFiles(prev => [...prev, { id: `f-${Date.now()}`, name: file.name || `image.png`, content: `[Image: ${file.name} — ${Math.round(file.size / 1024)}kb]`, type: "image", sizeKb: Math.round(file.size / 1024), previewUrl: dataUrl }]);
        return;
      }
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload", { 
        method: "POST", 
        headers: { "x-access-code": accessCode },
        body: fd 
      });
      if (res.status === 401) { handleAuthError(); throw new Error("Unauthorized"); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setUploadedFiles(prev => [...prev, { id: `f-${Date.now()}`, name: data.fileName, content: data.content, type: data.type, sizeKb: data.sizeKb }]);
    } catch (err) {
      setUploadError((err as Error)?.message ?? "Upload failed"); setTimeout(() => setUploadError(""), 5000);
    } finally {
      setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [accessCode, handleAuthError]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (imageItem) { e.preventDefault(); const f = imageItem.getAsFile(); if (f) await processFile(f); }
  }, [processFile]);

  if (isAuthChecking) {
    return <div style={{ height: "100vh", background: "var(--bg-0)", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 className="spin" color="#ef4444" size={24} /></div>;
  }

  if (!accessCode && !isAuthChecking) {
    return <AuthOverlay onVerified={handleVerified} />;
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-0)", position: "relative", overflow: "hidden" }}>
      <SettingsModal 
        open={settingsOpen} 
        onClose={() => setSettingsOpen(false)}
        accessCode={accessCode}
        onSaveAccessCode={(c) => { setAccessCode(c); localStorage.setItem("azmoki_access_code", c); }}
        customKey={customApiKey}
        onSaveCustomKey={(k) => { setCustomApiKey(k); localStorage.setItem("azmoki_custom_api_key", k); refreshModels(); }}
      />

      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: `linear-gradient(rgba(220,38,38,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(220,38,38,0.022) 1px, transparent 1px)`, backgroundSize: "44px 44px" }} />
      <div style={{ position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)", width: 700, height: 450, background: "radial-gradient(ellipse, rgba(220,38,38,0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <Sidebar sessions={sessions} activeId={activeSessionId} onSelect={switchSession} onNew={createNewSession} onDelete={deleteSession} open={sidebarOpen} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 5 }}>
        <header style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 1rem", borderBottom: "1px solid var(--border-red)", background: "rgba(6,8,12,0.94)", backdropFilter: "blur(14px)", gap: "0.75rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ width: 30, height: 30, borderRadius: "7px", border: "1px solid var(--border-dim)", background: "var(--bg-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Menu size={14} color="var(--txt-2)" /></button>
            <div style={{ width: 30, height: 30, borderRadius: "7px", background: "linear-gradient(135deg, rgba(220,38,38,0.28), rgba(220,38,38,0.08))", border: "1px solid rgba(220,38,38,0.38)", display: "flex", alignItems: "center", justifyContent: "center" }}><Crosshair size={14} color="#ef4444" /></div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: "0.9rem", color: "var(--txt-0)", letterSpacing: "0.04em" }}>Azmoki</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "0.55rem", color: "#ef4444", letterSpacing: "0.16em", textTransform: "uppercase" }}>AI Red Team Chat</div>
            </div>
          </div>
          <ModeToggle mode={mode} onChange={setMode} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <ModelSelector models={models} selected={selectedModel} onSelect={setSelectedModel} loading={modelsLoading} onRefresh={refreshModels} />
            <button onClick={() => setSettingsOpen(true)} style={{ width: 30, height: 30, borderRadius: "7px", border: "1px solid var(--border-dim)", background: "var(--bg-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Settings size={14} color="var(--txt-2)" /></button>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: isEmpty ? 0 : "1.25rem 0" }}>
          {isEmpty ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "2rem 1rem" }}>
              <div style={{ width: 66, height: 66, borderRadius: "15px", background: `linear-gradient(135deg, ${modeColor}38, ${modeColor}0d)`, border: `1px solid ${modeColor}50`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem", boxShadow: `0 0 40px ${modeColor}1a` }}><Crosshair size={26} color={modeColor} /></div>
              <h1 style={{ fontFamily: "var(--mono)", fontSize: "1.4rem", fontWeight: 700, color: "var(--txt-0)", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>Azmoki</h1>
              <p style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: modeColor, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.6rem" }}>{MODE_META[mode].desc}</p>
              <p style={{ color: "var(--txt-1)", fontSize: "0.82rem", textAlign: "center", maxWidth: 440, lineHeight: 1.65, marginBottom: "1.6rem" }}>Expert guidance on CTF challenges, MITRE ATT&CK TTPs, Active Directory attacks, OSINT, penetration testing methodology, and threat intelligence.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.55rem", width: "100%", maxWidth: 680 }}>
                {QUICK_PROMPTS.map(qp => (
                  <button key={qp.label} onClick={() => setInput(qp.prompt)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.8rem", background: "var(--bg-card)", border: "1px solid var(--border-dim)", borderRadius: "10px", cursor: "pointer", textAlign: "left", transition: "all 0.18s", color: "var(--txt-0)" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-red)"; e.currentTarget.style.background = "var(--bg-2)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-dim)"; e.currentTarget.style.background = "var(--bg-card)"; }}>
                    <div style={{ width: 28, height: 28, borderRadius: "6px", background: "var(--red-lo)", border: "1px solid var(--border-red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><qp.icon size={12} color="#ef4444" /></div>
                    <div><div style={{ fontSize: "0.77rem", fontWeight: 500, color: "var(--txt-0)", marginBottom: "0.1rem" }}>{qp.label}</div><div style={{ fontSize: "0.62rem", color: "var(--txt-2)", fontFamily: "var(--mono)" }}>Quick start ›</div></div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 1.1rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              {isLoading && <TypingIndicator mode={mode} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <div style={{ borderTop: "1px solid var(--border-red)", background: "rgba(6,8,12,0.97)", backdropFilter: "blur(14px)", padding: "0.7rem 1rem 0.9rem", flexShrink: 0 }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            {(uploadedFiles.length > 0 || uploadError) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem", alignItems: "center" }}>
                {uploadedFiles.map(f => <FileChip key={f.id} file={f} onRemove={() => setUploadedFiles(prev => prev.filter(x => x.id !== f.id))} />)}
                {uploadError && <span style={{ fontSize: "0.7rem", color: "#ef4444", fontFamily: "var(--mono)" }}>⚠ {uploadError}</span>}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.55rem", alignItems: "flex-end", background: "var(--bg-card)", border: `1px solid ${modeColor}33`, borderRadius: "12px", padding: "0.5rem 0.5rem 0.5rem 0.85rem", transition: "border-color 0.2s, box-shadow 0.2s" }} onFocusCapture={e => { if (e.currentTarget.contains(e.target)) { e.currentTarget.style.borderColor = `${modeColor}55`; e.currentTarget.style.boxShadow = `0 0 0 2px ${modeColor}10`; } }} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) { e.currentTarget.style.borderColor = `${modeColor}33`; e.currentTarget.style.boxShadow = "none"; } }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", paddingBottom: "0.15rem", flexShrink: 0 }}><Terminal size={12} color={modeColor} /><span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: modeColor }}>{">"}_</span></div>
              <textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder={`[${MODE_META[mode].label.toUpperCase()}] ${mode === "research" ? "Topic to research…" : mode === "agentic" ? "Mission objective…" : "Ask about TTPs, CTFs, pentest methodology… (ctrl+v to paste images)"}`} rows={1} style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", color: "var(--txt-0)", fontFamily: "var(--font)", fontSize: "0.875rem", lineHeight: 1.6, paddingTop: "0.1rem", minHeight: "26px", maxHeight: "160px", overflowY: "auto" }} />
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexShrink: 0 }}>
                <input ref={fileInputRef} type="file" accept="*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach any file" style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid var(--border-dim)", background: "var(--bg-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-red)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-dim)")}>{isUploading ? <Loader2 size={13} color="var(--txt-2)" className="spin" /> : <Upload size={13} color="var(--txt-2)" />}</button>
                {isLoading && <button type="button" onClick={stop} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0 0.6rem", height: 32, borderRadius: "8px", border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.1)", cursor: "pointer", color: "#ef4444", fontSize: "0.7rem", fontFamily: "var(--mono)" }}><SquareSlash size={12} /> stop</button>}
                <button type="button" onClick={handleSend} disabled={!input.trim() || isLoading} style={{ width: 34, height: 34, borderRadius: "8px", border: "none", background: input.trim() && !isLoading ? `linear-gradient(135deg, ${modeColor}, ${modeColor}bb)` : "var(--bg-3)", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", boxShadow: input.trim() && !isLoading ? `0 0 16px ${modeColor}44` : "none" }}><Send size={14} color={input.trim() && !isLoading ? "#fff" : "var(--txt-2)"} /></button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "0.4rem" }}><span style={{ fontSize: "0.6rem", fontFamily: "var(--mono)", color: "var(--txt-2)" }}>↵ send · shift+↵ newline · ctrl+v paste image · any file type · for authorized research only</span></div>
          </div>
        </div>
      </div>
      <style jsx global>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }`}</style>
    </div>
  );
}
