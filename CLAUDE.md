# Storyboard Composer

## Project overview

AI-powered storyboard tool. Users describe scenes in plain English, Claude generates structured JSON that places emoji assets on stock photo backgrounds in a 16:9 canvas.

## Architecture

- **Frontend**: Vite + React (src/App.jsx) — single-file app, all inline styles, no component library
- **Backend**: Express (server.js) — two endpoints:
  - `POST /api/generate` — calls `claude` CLI with `-p` flag to parse scene descriptions into frame JSON
  - `GET /api/bg?q=query` — proxies stock photos from LoremFlickr to avoid CORS

## Running locally

```bash
# Backend (port 3001)
node server.js

# Frontend (port 5173)
npm run dev
```

## Key implementation details

- The backend calls claude CLI via `spawn` with `stdio: ["ignore", "pipe", "pipe"]` — stdin MUST be ignored or claude hangs waiting for input
- Claude binary path is hardcoded to `/Users/jamesrichard/.local/bin/claude` in server.js
- Model is `sonnet` — haiku is too weak for good scene composition
- The system prompt in server.js defines the frame JSON schema and instructs Claude on composition (depth, sizing, positioning)
- Positions are percentage-based (0-100 for x and y), sizes are pixel values (20-120)
- Background images use LoremFlickr with a hash-based `lock` param for deterministic results per query
- CSV export produces one row per element for Google Sheets editing

## Frame JSON schema

```json
{
  "background": "search query for stock photo",
  "shot": "Wide Shot | Medium Shot | Close-Up | Bird's Eye | Low Angle | Dutch Angle",
  "caption": "scene description",
  "action": "action note for animators",
  "elements": [
    { "emoji": "🧙", "label": "wizard", "x": 50, "y": 75, "size": 70 }
  ]
}
```

## Common tasks

- **Change AI model**: edit `--model` arg in `callClaude()` in server.js
- **Modify scene composition rules**: edit `SYSTEM_PROMPT` in server.js
- **Change background image source**: edit `/api/bg` handler in server.js and `bgUrl()` in App.jsx
- **Add new frame properties**: update the system prompt, frame JSON extraction in server.js, and rendering in App.jsx
