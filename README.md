# AZMOKI — AI Red Team Chat

An elite Red Team AI advisor built with Next.js + NVIDIA NIM, deployable to Vercel.

## Features
- 🎯 CTF challenge guidance (pwn, rev, web, forensics, crypto, OSINT)
- 🛡️ MITRE ATT&CK TTP explanations
- 🔴 Active Directory attack path methodology
- 🌐 OSINT & reconnaissance techniques
- 📋 Pentest report writing assistance
- 🖥️ Premium dark-red hacker aesthetic with streaming responses

## Setup

### 1. Add your NVIDIA NIM API Key
Edit `.env.local` and replace the placeholder:
```
NVIDIA_NIM_API_KEY=your_actual_key_here
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
```
Get a key at: https://build.nvidia.com/

### 2. Install dependencies
```bash
npm install
```

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:3000

---

## Deploy to Vercel

### Option A: Vercel CLI
```bash
npm install -g vercel
vercel
```
When prompted, add your environment variables.

### Option B: GitHub + Vercel Dashboard
1. Push this folder to a GitHub repository
2. Go to https://vercel.com/new
3. Import your repository
4. Under **Environment Variables**, add:
   - `NVIDIA_NIM_API_KEY` = your key
   - `NVIDIA_MODEL` = `meta/llama-3.3-70b-instruct`
5. Click **Deploy**

Your app will be live at `https://your-app-name.vercel.app` — accessible from any device including your work laptop.

---

## Changing the Model

Edit `NVIDIA_MODEL` in `.env.local` (or Vercel dashboard). Popular options:
| Model | Notes |
|---|---|
| `meta/llama-3.3-70b-instruct` | Default — best quality |
| `mistralai/mixtral-8x7b-instruct` | Faster |
| `microsoft/phi-3-medium-128k-instruct` | Long context |

Browse all at https://build.nvidia.com/explore/discover
