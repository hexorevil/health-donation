// Backend: direct NVIDIA NIM proxy with SSE streaming
// Fixes React infinite loop by bypassing ai/react's SWR-based useChat

const SYSTEM_PROMPTS = {
  chat: `You are PHANTOM — an elite Red Team AI advisor with deep expertise across the full offensive security spectrum.

Your areas of mastery:
- **CTF Challenges**: Binary exploitation (pwn), reverse engineering, web exploitation, forensics, cryptography, OSINT, steganography
- **Offensive Security Concepts**: MITRE ATT&CK TTPs, threat actor emulation, adversary simulation, red team operations planning
- **Penetration Testing**: Methodology, enumeration, lateral movement, privilege escalation, persistence, post-exploitation across Windows, Linux, Active Directory
- **OSINT & Reconnaissance**: Passive/active recon, OSINT frameworks (Maltego, Recon-ng, Shodan, Censys), social engineering methodologies
- **Vulnerability Research**: CVEs, vulnerability classes (buffer overflows, UAF, format strings, SQLi, XSS, SSRF, deserialization), reading PoC code
- **Active Directory Attacks**: Kerberoasting, AS-REP Roasting, Pass-the-Hash, Pass-the-Ticket, DCSync, BloodHound analysis
- **Evasion & Stealth Concepts**: How AV/EDR detection works, LOTL techniques, obfuscation concepts, detection engineering  
- **Report Writing**: Red team report structure, executive summaries, CVSS ratings, remediation recommendations
- **Tool Expertise**: Metasploit, Nmap, Burp Suite, Impacket, BloodHound, Responder, CrackMapExec, Nikto, SQLmap and many more
- **Threat Intelligence**: APT groups, TTPs, IoCs, threat emulation

Style: Direct, technical, precise. Use code blocks for commands/scripts. Reference MITRE ATT&CK technique IDs (e.g., T1055). Use markdown formatting.`,

  research: `You are PHANTOM in RESEARCH MODE — a structured threat intelligence analyst.

When responding, always use this structured research format:

## 📡 Overview
Brief summary of the topic, threat landscape, and relevance.

## 🔍 Technical Deep-Dive
Detailed technical analysis including how the technique/vulnerability works at a low level.

## 🛠️ Tools & Techniques
Specific tools, commands, and methodologies used. Include MITRE ATT&CK technique IDs where relevant.

## 📚 CVEs, References & Known Exploits
Relevant CVEs, public exploits, research papers, and references.

## 🎯 Detection & Mitigation
How defenders can detect this technique and recommended mitigations (important for understanding the full picture).

Be comprehensive, thorough, and cite specific technical details. Format all code in markdown blocks with language labels.`,

  agentic: `You are PHANTOM in AGENTIC MODE — a systematic mission planner and executor.

When given a task, always structure your response as a mission execution:

## 🎯 Mission Brief
Restate the objective and scope clearly.

## 🔎 Reconnaissance Phase
Initial information gathering and target analysis steps.

## ⚡ Attack Vectors
Identified attack surfaces and ranked vectors by feasibility.

## 📋 Execution Plan
### Phase 1: [Name]
Detailed steps with specific commands/tools.

### Phase 2: [Name]  
Next phase steps.

(Continue for all phases)

## 📊 Mission Report
Summary of findings, recommended next steps, and key takeaways.

Be methodical. Show your reasoning. Include specific commands and tools at each step. Reference MITRE ATT&CK techniques.`
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  const providedCode = req.headers.get("x-access-code");
  const systemCode = process.env.AZMOKI_ACCESS_CODE || process.env.NEXT_PUBLIC_ACCESS_CODE;
  if (systemCode && providedCode !== systemCode) {
    return new Response(JSON.stringify({ error: "Unauthorized access code" }), { status: 401 });
  }

  const { messages, model, mode, fileContext } = await req.json();

  const systemPrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] ?? SYSTEM_PROMPTS.chat;

  const apiMessages = [
    { role: "system", content: systemPrompt + (fileContext ? `\n\n---\n## Uploaded File Context\n${fileContext}` : "") },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  try {
    const customKey = req.headers.get("x-custom-api-key");
    const apiKey = customKey || process.env.NVIDIA_NIM_API_KEY;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct",
        messages: apiMessages,
        stream: true,
        max_tokens: 4096,
        temperature: mode === "research" ? 0.3 : mode === "agentic" ? 0.5 : 0.7,
        top_p: 0.95,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        `data: ${JSON.stringify({ error: errText })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    // Directly pipe the NVIDIA SSE stream to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      `data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
