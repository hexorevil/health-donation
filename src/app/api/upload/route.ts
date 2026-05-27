// File upload: supports any file type. PDF fix uses require() to bypass
// Next.js App Router's ESM/test-fixture issue with pdf-parse.
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const TEXT_EXTS = new Set([
  "txt","md","markdown","rst","log","csv","tsv","json","jsonl","xml","yaml","yml",
  "toml","ini","cfg","conf","env","properties","html","htm","css","scss","sass","less",
  "js","mjs","cjs","ts","tsx","jsx","vue","svelte","astro",
  "py","rb","php","go","rs","java","kt","swift","cs","cpp","c","h","hpp","cc",
  "sh","bash","zsh","fish","ps1","bat","cmd","pwsh","makefile","dockerfile",
  "sql","graphql","proto","tf","hcl","nix","lua","r","jl","pl","pm","asm","s","nasm",
  "gitignore","gitattributes","editorconfig","eslintrc","prettierrc","nvmrc",
]);

const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","webp","bmp","ico","svg","tiff","tif","avif","heic"]);

export async function POST(req: NextRequest) {
  try {
    const providedCode = req.headers.get("x-access-code");
    const systemCode = process.env.AZMOKI_ACCESS_CODE || process.env.NEXT_PUBLIC_ACCESS_CODE;
    if (systemCode && providedCode !== systemCode) {
      return Response.json({ error: "Unauthorized access code" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sizeKb = Math.round(buffer.length / 1024);

    let content = "";
    let type = "text";

    // ── Images: handled client-side, but if server receives one return metadata ──
    if (IMAGE_EXTS.has(ext) || file.type.startsWith("image/")) {
      return Response.json({
        fileName, type: "image", sizeKb,
        content: `[Image: ${fileName} — ${sizeKb}kb]`,
      });
    }

    // ── PDF ──
    if (ext === "pdf" || file.type === "application/pdf") {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const data = await parser.getText();
        content = data.text?.trim() ?? "";
        if (!content) throw new Error("No text extracted from PDF");
        type = "pdf";
      } catch (pdfErr) {
        return Response.json({
          error: `PDF parse failed: ${(pdfErr as Error).message}. The PDF may be scanned/image-only or password-protected.`,
        }, { status: 422 });
      }
    }

    // ── DOCX ──
    else if (ext === "docx" || file.type.includes("wordprocessingml")) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        content = result.value?.trim() ?? "";
        if (!content) throw new Error("No text extracted");
        type = "docx";
      } catch (docxErr) {
        return Response.json({ error: `DOCX parse failed: ${(docxErr as Error).message}` }, { status: 422 });
      }
    }

    // ── Text / Code files ──
    else if (
      TEXT_EXTS.has(ext) ||
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      file.type === "application/xml" ||
      fileName === "Makefile" || fileName === "Dockerfile" ||
      fileName.startsWith(".env")
    ) {
      content = buffer.toString("utf-8");
      type = "code";
    }

    // ── Unknown: try UTF-8, fall back to hex dump ──
    else {
      const attempt = buffer.toString("utf-8");
      const replacements = (attempt.match(/\uFFFD/g) ?? []).length;
      if (replacements / Math.max(attempt.length, 1) < 0.05) {
        content = attempt;
        type = "text";
      } else {
        const hexDump = buffer.slice(0, 512).toString("hex").match(/.{1,2}/g)?.join(" ") ?? "";
        content = [
          `[Binary file: ${fileName}]`,
          `MIME: ${file.type || "unknown"} | Size: ${sizeKb}kb | Ext: .${ext || "none"}`,
          ``,
          `First 512 bytes (hex):`,
          hexDump,
          ``,
          `Note: This is a binary file. Describe what you need help analyzing.`,
        ].join("\n");
        type = "binary";
      }
    }

    if (!content.trim()) {
      return Response.json({ error: "No readable content found in file." }, { status: 422 });
    }

    // Smart truncation: keep head + tail
    const MAX = 50000;
    if (content.length > MAX) {
      const half = MAX / 2;
      content = `${content.slice(0, half)}\n\n... [${Math.round((content.length - MAX) / 1000)}k chars truncated] ...\n\n${content.slice(-half)}`;
    }

    return Response.json({ fileName, content, type, charCount: content.length, sizeKb });
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "Server error" }, { status: 500 });
  }
}
