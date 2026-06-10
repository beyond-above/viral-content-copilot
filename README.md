# 🎬 Viral Content Copilot

A premium, full-stack, multi-agent AI workspace designed for instant trend discovery and automated video creation. This application was built for the Google Cloud Hackathon. It features an advanced agentic backend powered by Google Gemini and custom-built browser-based video-stitching architecture.

---

## 🚀 Live Production Access (Try It Now!)

We have deployed the fully containerized application to Google Cloud Run with secure HTTPS. Experience the full flow live instantly:

*   🌐 **Interactive Frontend UI:** [https://viral-content-copilot-ui-201279421188.us-central1.run.app](https://viral-content-copilot-ui-201279421188.us-central1.run.app)
*   ⚙️ **Agentic FastAPI Backend:** [https://viral-content-copilot-201279421188.us-central1.run.app](https://viral-content-copilot-201279421188.us-central1.run.app)

---

## ✨ Key Features & Capabilities

### 🕵️‍♂️ Trend Discovery & Analysis (Gemini-Powered)
*   **Dual-Strategy Trend Searcher:** Dynamically crawls the web to discover the latest viral topics using active Google Search APIs. Implements Gemini LLM fallback parsing to intelligently reconstruct high-value trend objects if standard search results contain placeholder noise.
*   **Prompt Optimization:** Takes a raw user topic, cross-references it with live trends, and crafts a highly structured visual and audio script.

### 🔌 Supabase MCP Video Bridge Integration
*   Integrates with a secure **Model Context Protocol (MCP)** server via streamable HTTP to process media generation tasks.
*   **Robust RAI Safety Filters:** Out-of-the-box support for Vertex Imagen content filters. The worker automatically catches safety blocks (`image_empty`), retries blocked slots with sanitized prompts, or mirrors adjacent frames to guarantee a complete, flawless media package without silent job failures.

### 🎨 Premium Client-Side Video Assembler
*   **In-Browser Stitching Engine:** Merges synthesized images and high-fidelity audio tracks entirely inside the user's browser session. Zero cloud rendering costs, fully client-side.
*   **Dynamic Audio Sync:** Perfectly matches the video length to the generated voiceover soundtrack, giving each slide exactly **1/6th** of the total audio duration.
*   **Ken Burns Cinematic Effect:** Applies professional $90\% \rightarrow 115\%$ smooth zoom transitions on slide changes to give images a flowing, premium, high-production video feel.
*   **Advanced Audio Controls:** Integrates timeline-synchronized audio play and pause capabilities, enabling users to seamlessly pause/resume playback mid-slideshow.
*   **Offline Downloads:** Supports instant MP4 download of the fully stitched video right from the browser.

---

## 📐 Project Architecture

```text
viral-content-factory/
├── copilot/                    # Main application suite
│   ├── ui/                    # Vite + React + TypeScript Frontend
│   │   ├── src/               # UI components, video player & canvas engine
│   │   ├── Dockerfile         # Multi-stage production Nginx build container
│   │   ├── nginx.conf         # Nginx SPA config routing rule
│   │   └── .dockerignore      # Prevents local dependencies overwrite
│   │
│   ├── tools/                 # Custom tool definitions
│   │   └── mcp_tool.py        # Streamable HTTP MCP Client session bridge
│   │
│   ├── backend_agent.py       # Orchestrates the Gemini multi-agent workflow
│   ├── backend_main.py        # FastAPI Backend serving /chat endpoints
│   └── *.yaml                 # Declarative Agent-CLI configurations
│
├── app/                       # Fallback / CLI scaffolding files
├── tests/                     # Unit and integration test suites
├── .env                       # Local environment secrets (ignored by Git)
└── pyproject.toml             # uv Python dependency manifest
```

---

## 🛠️ Local Development Setup

To run both the backend and frontend services locally on your machine, follow these simple steps.

### Prerequisites
*   [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)
*   [Node.js](https://nodejs.org/) (v20+ recommended)

---

### 1. Backend Service Configuration
Create a `.env` file in the root directory and configure your Google Cloud project and MCP credentials:

```env
GOOGLE_CLOUD_PROJECT="agentic26"
GOOGLE_CLOUD_LOCATION="global"
GOOGLE_GENAI_USE_VERTEXAI=True

# MCP Generation Credentials
MCP_ENDPOINT_URL="https://frcusgsfxbgrkvslksaz.supabase.co/functions/v1/mcp-auto-video"
MCP_AUTH_TOKEN="your_mcp_auth_token_here"
```

Install backend dependencies and run the server:
```bash
# Install dependencies with uv
uv sync

# Launch the FastAPI development backend (runs on port 8000)
PYTHONUNBUFFERED=1 uv run python copilot/backend_main.py
```

---

### 2. Frontend User Interface Setup
Navigate to the `ui` folder, configure local proxy variables, and launch the development server:

```bash
cd copilot/ui

# Install dependencies
npm install

# Launch the Vite development server (runs on port 3000)
# Note: Since VITE_BACKEND_URL is omitted locally, Vite automatically proxies
# API calls from http://localhost:3000/chat to http://localhost:8000/chat
npm run dev
```

---

## 🔒 Security & Secrets Design

This project is built from the ground up following cloud security best practices:

*   **No Hardcoded Secrets:** No GCP Service Account files or raw keys are committed to Git. The project relies on **Application Default Credentials (ADC)**, dynamically loading IAM roles in Cloud Run.
*   **Environment Variables:** Critical MCP keys are injected dynamically via Google Cloud Run Metadata. Local environment variables are stored in the `.env` file, which is excluded from Git tracking via `.gitignore`.
*   **Pruned Containers:** Clean, multi-stage Docker builds ensure that local dependency states never bloat or conflict with production execution steps.
