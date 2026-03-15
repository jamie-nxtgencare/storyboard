# Storyboard

AI-powered storyboard composer. Type a scene description in plain English, and Claude generates structured frame data — placing emoji assets on stock photo backgrounds in a 16:9 canvas.

Built as a proof of concept for the idea that storyboarding doesn't need image generation — it needs a **scene compositor** that places existing assets intelligently.

## How it works

```
"cats having a tea party in a garden"
         ↓
   Claude (sonnet) parses scene
         ↓
   Structured JSON: background query, emoji elements with x/y/size
         ↓
   React canvas renders frame with stock photo bg + positioned emojis
```

The backend calls `claude` CLI directly in print mode (`-p`) — no API keys needed, just a working Claude Code installation.

## Quick start

```bash
npm install

# Terminal 1: backend (Express on :3001)
node server.js

# Terminal 2: frontend (Vite on :5173)
npm run dev
```

Open http://localhost:5173

## Features

- **AI tab** — type a scene description, hit "New Frame" or Cmd+Enter. Claude picks emojis, positions, sizes, background, shot type, caption, and action notes.
- **Assets tab** — manually add any emoji to the current frame
- **Frame tab** — edit background query, shot type, caption, action, and element list
- **Frame strip** — multi-frame timeline at the bottom. Add, duplicate, delete frames.
- **Export CSV** — one row per element, opens in Google Sheets with editable positions/sizes
- **Stock photo backgrounds** — Claude returns a search query, the server proxies matching images from LoremFlickr

## Architecture

```
src/App.jsx     React frontend — canvas renderer, frame management, CSV export
server.js       Express backend — calls claude CLI, proxies background images
```

### API

**POST /api/generate** — `{ "scene": "description" }` → frame JSON

**GET /api/bg?q=query** — proxies LoremFlickr images to avoid CORS issues

### Frame JSON format

```json
{
  "background": "dark forest",
  "shot": "Wide Shot",
  "caption": "The wizard arrives",
  "action": "wizard walks into clearing",
  "elements": [
    { "emoji": "🧙", "label": "wizard", "x": 50, "y": 75, "size": 70 },
    { "emoji": "🌲", "label": "tree", "x": 15, "y": 40, "size": 50 }
  ]
}
```

Position: `x` and `y` are 0-100 percentages. `size` is font size in pixels (20-120).

## Prerequisites

- Node.js
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and authenticated
