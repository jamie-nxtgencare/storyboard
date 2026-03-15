import express from "express";
import cors from "cors";
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

const CLAUDE_BIN = "/Users/jamesrichard/.local/bin/claude";

const SYSTEM_PROMPT = `You are a storyboard scene compositor. Parse scene descriptions into structured JSON for a 16:9 frame.
Output ONLY valid JSON, no markdown, no backticks, no prose.

Each element has an "emoji" field — use ANY emoji that fits. Be creative, use multiple emojis to build rich scenes (characters, props, environmental details, effects).
The "background" field is a short search query (1-3 words) for a stock photo.

Position is a percentage-based grid:
- x: 0-100 (0=left edge, 50=center, 100=right edge)
- y: 0-100 (0=top edge, 50=middle, 100=bottom edge)
- size: number from 20 to 120 (font size in pixels — 20=tiny detail, 40=small prop, 60=normal character, 80=large character, 100=dominant element, 120=massive)

Think about depth and composition:
- Foreground elements should be larger and lower (high y, large size)
- Background elements should be smaller and higher (low y, small size)
- Spread elements across the frame for good composition
- Use size differences to create depth

EXAMPLE:
{"background":"volcanic landscape","shot":"Wide Shot","caption":"Hero faces the dragon","action":"Hero raises sword as dragon breathes fire","elements":[{"emoji":"🦸","label":"hero","x":25,"y":75,"size":70},{"emoji":"🐉","label":"dragon","x":75,"y":55,"size":110},{"emoji":"🔥","label":"fire blast","x":50,"y":45,"size":60},{"emoji":"🪨","label":"rock","x":10,"y":85,"size":35},{"emoji":"🌋","label":"volcano","x":85,"y":15,"size":45},{"emoji":"💨","label":"smoke","x":60,"y":20,"size":30}]}

Output only JSON. Nothing else.`;

function callClaude(scene) {
  return new Promise((resolve, reject) => {
    const prompt = `${SYSTEM_PROMPT}\n\nScene: ${scene}`;

    console.log(`Calling claude for scene: "${scene}"`);

    const proc = spawn(CLAUDE_BIN, [
      "-p", prompt,
      "--model", "sonnet",
      "--output-format", "text",
      "--no-session-persistence",
    ], {
      stdio: ["ignore", "pipe", "pipe"],  // close stdin so claude doesn't wait
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout.trim());
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

app.get("/", (req, res) => {
  res.json({ status: "ok", endpoint: "POST /api/generate", body: { scene: "description" } });
});

app.post("/api/generate", async (req, res) => {
  const { scene } = req.body;
  if (!scene) return res.status(400).json({ error: "No scene provided" });

  console.log(`Generating frame for: "${scene}"`);

  try {
    const text = await callClaude(scene);
    console.log("Claude response:", text.slice(0, 200));

    // Extract JSON from response (handles markdown code blocks too)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy background images to avoid CORS/redirect issues
app.get("/api/bg", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).send("No query");

  const keywords = q.replace(/\s+/g, ",");
  const hash = [...q].reduce((a, c) => a + c.charCodeAt(0), 0);
  const url = `https://loremflickr.com/1600/900/${encodeURIComponent(keywords)}/all?lock=${hash}`;

  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`${resp.status}`);
    res.set("Content-Type", resp.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("BG fetch error:", err.message);
    res.status(502).send("Failed to fetch background");
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Storyboard server running on http://localhost:${PORT}`));
