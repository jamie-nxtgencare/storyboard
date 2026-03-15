import express from "express";
import cors from "cors";
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

const CLAUDE_BIN = "/Users/jamesrichard/.local/bin/claude";

const SYSTEM_PROMPT = `You are a storyboard scene compositor for a continuous visual narrative. Parse scene descriptions into structured JSON for a 16:9 frame.
Output ONLY valid JSON, no markdown, no backticks, no prose.

CONTINUITY:
- This is a storyboard — frames tell a connected story
- Recurring characters should use the SAME emoji and label across frames so the viewer can follow them
- Follow the user's scene description first — if they describe a new location, new characters, or a different setup, do that. Continuity serves the story, not the other way around
- Only carry forward elements that make sense for the new scene

EMOJI SELECTION:
- Use ANY emoji. Be creative — characters, props, environmental details, effects
- Match the emotional tone: for light/cheerful scenes, expressive emojis are fine. For dark/dramatic/serious scenes, prefer objects, symbols, silhouettes, and abstract shapes over cartoonish yellow faces. Let the background carry the emotion; use emojis as compositional anchors, not as the mood itself
- Size elements by NARRATIVE IMPORTANCE, not just physical size. The most important story beat in the frame should be prominent — a snake that kills a character should be large and central, not a tiny afterthought

The "background" field is a 1-2 word search query for a stock photo (e.g. "forest", "dark cave", "ocean", "castle"). Keep it simple — just the core setting.

The "mood" field sets the visual tone of the frame's UI overlay (annotation boxes, borders):
- "light" — bright, cheerful, informational (yellow annotations)
- "neutral" — standard (muted annotations)
- "dark" — somber, dramatic, intense (dark red/charcoal annotations)
- "tense" — suspenseful, uneasy (amber/warning annotations)

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
{"background":"volcano","mood":"tense","shot":"Wide Shot","caption":"Hero faces the dragon","action":"Hero raises sword as dragon breathes fire","elements":[{"emoji":"🦸","label":"hero","x":25,"y":75,"size":70},{"emoji":"🐉","label":"dragon","x":75,"y":55,"size":110},{"emoji":"🔥","label":"fire blast","x":50,"y":45,"size":60},{"emoji":"🪨","label":"rock","x":10,"y":85,"size":35},{"emoji":"🌋","label":"volcano","x":85,"y":15,"size":45},{"emoji":"💨","label":"smoke","x":60,"y":20,"size":30}]}

Output only JSON. Nothing else.`;

function buildPrompt(scene, previousFrames) {
  let prompt = SYSTEM_PROMPT;

  if (previousFrames && previousFrames.length > 0) {
    prompt += `\n\nPREVIOUS FRAMES IN THIS STORYBOARD (maintain continuity with these):`;
    previousFrames.forEach((frame, i) => {
      const chars = frame.elements
        .map((el) => `${el.emoji} "${el.label}" at x:${el.x} y:${el.y} size:${el.size}`)
        .join(", ");
      prompt += `\nFrame ${i + 1}: [${frame.shot}] bg:"${frame.background}" mood:${frame.mood || "neutral"} — "${frame.caption}" | ${frame.action || "no action"} | Elements: ${chars}`;
    });
    prompt += `\n\nYou are now generating Frame ${previousFrames.length + 1}. Maintain character emojis, labels, and visual continuity from the frames above.`;
  }

  prompt += `\n\nScene: ${scene}`;
  return prompt;
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    console.log(`Calling claude (prompt length: ${prompt.length})`);

    const proc = spawn(CLAUDE_BIN, [
      "-p", prompt,
      "--model", "sonnet",
      "--output-format", "text",
      "--no-session-persistence",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
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
  const { scene, previousFrames } = req.body;
  if (!scene) return res.status(400).json({ error: "No scene provided" });

  console.log(`Generating frame ${(previousFrames?.length || 0) + 1} for: "${scene}"`);

  try {
    const prompt = buildPrompt(scene, previousFrames);
    const text = await callClaude(prompt);
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

  // Use first 2 keywords max — LoremFlickr /all requires ALL to match which often fails
  const keywords = q.trim().split(/\s+/).slice(0, 2).join(",");
  const hash = [...q].reduce((a, c, i) => ((a * 31 + c.charCodeAt(0)) & 0x7fffffff), 0);
  const url = `https://loremflickr.com/1600/900/${encodeURIComponent(keywords)}?lock=${hash}`;

  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`${resp.status}`);
    res.set("Content-Type", resp.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "no-cache");
    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("BG fetch error:", err.message);
    res.status(502).send("Failed to fetch background");
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Storyboard server running on http://localhost:${PORT}`));
