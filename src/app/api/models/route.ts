// Models route: fetch from NVIDIA NIM + deduplicate by ID + curated fallback
export const runtime = "nodejs";

const FALLBACK_MODELS = [
  { id: "meta/llama-3.1-8b-instruct",                   label: "Llama 3.1 8B",              provider: "Meta",      speed: "fast",   ctx: "128k" },
  { id: "meta/llama-3.1-70b-instruct",                  label: "Llama 3.1 70B",             provider: "Meta",      speed: "medium", ctx: "128k" },
  { id: "meta/llama-3.1-405b-instruct",                 label: "Llama 3.1 405B",            provider: "Meta",      speed: "slow",   ctx: "128k" },
  { id: "meta/llama-3.3-70b-instruct",                  label: "Llama 3.3 70B",             provider: "Meta",      speed: "medium", ctx: "128k" },
  { id: "meta/llama-3.2-3b-instruct",                   label: "Llama 3.2 3B",              provider: "Meta",      speed: "fast",   ctx: "128k" },
  { id: "meta/llama-3.2-1b-instruct",                   label: "Llama 3.2 1B",              provider: "Meta",      speed: "fast",   ctx: "128k" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct",       label: "Nemotron 70B",              provider: "NVIDIA",    speed: "medium", ctx: "128k" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1",       label: "Nemotron Super 49B",        provider: "NVIDIA",    speed: "medium", ctx: "128k" },
  { id: "mistralai/mistral-7b-instruct-v0.3",           label: "Mistral 7B",                provider: "Mistral",   speed: "fast",   ctx: "32k"  },
  { id: "mistralai/mixtral-8x7b-instruct-v0.1",         label: "Mixtral 8x7B",              provider: "Mistral",   speed: "medium", ctx: "32k"  },
  { id: "mistralai/mixtral-8x22b-instruct-v0.1",        label: "Mixtral 8x22B",             provider: "Mistral",   speed: "slow",   ctx: "64k"  },
  { id: "mistralai/mistral-large-2-instruct",           label: "Mistral Large 2",           provider: "Mistral",   speed: "slow",   ctx: "128k" },
  { id: "google/gemma-2-9b-it",                         label: "Gemma 2 9B",                provider: "Google",    speed: "fast",   ctx: "8k"   },
  { id: "google/gemma-2-27b-it",                        label: "Gemma 2 27B",               provider: "Google",    speed: "medium", ctx: "8k"   },
  { id: "microsoft/phi-3-mini-128k-instruct",           label: "Phi-3 Mini",                provider: "Microsoft", speed: "fast",   ctx: "128k" },
  { id: "microsoft/phi-3-medium-128k-instruct",         label: "Phi-3 Medium",              provider: "Microsoft", speed: "medium", ctx: "128k" },
  { id: "microsoft/phi-3.5-mini-instruct",              label: "Phi-3.5 Mini",              provider: "Microsoft", speed: "fast",   ctx: "128k" },
  { id: "qwen/qwen2.5-72b-instruct",                    label: "Qwen 2.5 72B",              provider: "Alibaba",   speed: "medium", ctx: "128k" },
  { id: "qwen/qwen2.5-coder-32b-instruct",              label: "Qwen 2.5 Coder 32B",        provider: "Alibaba",   speed: "medium", ctx: "32k"  },
  { id: "deepseek-ai/deepseek-r1",                      label: "DeepSeek R1",               provider: "DeepSeek",  speed: "slow",   ctx: "128k" },
  { id: "deepseek-ai/deepseek-r1-distill-llama-70b",   label: "DeepSeek R1 Distill 70B",   provider: "DeepSeek",  speed: "medium", ctx: "128k" },
];

type ModelMeta = typeof FALLBACK_MODELS[0];

function deduplicateById(models: ModelMeta[]): ModelMeta[] {
  const seen = new Set<string>();
  return models.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export async function GET(req: Request) {
  try {
    const providedCode = req.headers.get("x-access-code");
    const systemCode = process.env.AZMOKI_ACCESS_CODE || process.env.NEXT_PUBLIC_ACCESS_CODE;
    if (systemCode && providedCode !== systemCode) {
      return Response.json({ models: deduplicateById(FALLBACK_MODELS), source: "unauthorized" }, { status: 401 });
    }

    const customKey = req.headers.get("x-custom-api-key");
    const apiKey = customKey || process.env.NVIDIA_NIM_API_KEY;

    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Note: we can't statically cache this globally if API keys differ per request,
      // but caching per API key or disabling cache is safer. For now, disable global revalidate.
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json({ models: deduplicateById(FALLBACK_MODELS), source: "fallback" });
    }

    const data = await response.json();
    const rawModels: { id: string }[] = data?.data ?? [];

    const filtered: ModelMeta[] = rawModels
      .filter((m) => {
        const id = m.id.toLowerCase();
        return id.includes("instruct") || id.includes("chat") ||
          id.endsWith("-it") || id.includes("nemotron") || id.includes("deepseek-r1");
      })
      .map((m) => {
        const meta = FALLBACK_MODELS.find((f) => f.id === m.id);
        if (meta) return meta;
        const parts = m.id.split("/");
        const provider = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Unknown";
        const label = parts[1]?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? m.id;
        return { id: m.id, label, provider, speed: "medium" as const, ctx: "unknown" };
      });

    const models = deduplicateById(filtered.length > 0 ? filtered : FALLBACK_MODELS);
    return Response.json({ models, source: "live" });
  } catch {
    return Response.json({ models: deduplicateById(FALLBACK_MODELS), source: "fallback" });
  }
}
