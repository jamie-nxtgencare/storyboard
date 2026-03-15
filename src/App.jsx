import { useState, useRef } from "react";
import "./App.css";
import Player from "./Player";

function bgUrl(query) {
  if (!query) return null;
  return `http://localhost:3001/api/bg?q=${encodeURIComponent(query)}`;
}

const FALLBACK_BG = "linear-gradient(180deg, #2a2a3a 0%, #1a1a2a 100%)";

// Positions are now 0-100 percentages, sizes are pixel values directly

const EMPTY_FRAME = {
  background: "",
  shot: "Wide Shot",
  caption: "",
  action: "",
  elements: [],
};

const MOOD_STYLES = {
  light:   { actionBg: "rgba(255,200,0,0.85)",  actionColor: "#000", border: "#555" },
  neutral: { actionBg: "rgba(120,120,120,0.85)", actionColor: "#fff", border: "#444" },
  dark:    { actionBg: "rgba(140,30,30,0.85)",   actionColor: "#fff", border: "#522" },
  tense:   { actionBg: "rgba(180,100,20,0.85)",  actionColor: "#fff", border: "#654" },
};

function FrameCanvas({ frame }) {
  const url = frame.background ? bgUrl(frame.background) : null;
  const mood = MOOD_STYLES[frame.mood] || MOOD_STYLES.neutral;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: FALLBACK_BG,
        borderRadius: 8,
        overflow: "hidden",
        border: `2px solid ${mood.border}`,
      }}
    >
      {url && (
        <img
          src={url}
          alt={frame.background}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          zIndex: 1,
        }}
      >
        {frame.shot}{frame.mood && frame.mood !== "neutral" ? ` · ${frame.mood}` : ""}
      </div>

      {frame.elements.map((el, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${el.x ?? 50}%`,
            top: `${el.y ?? 50}%`,
            transform: "translate(-50%, -50%)",
            fontSize: el.size ?? 60,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            cursor: "default",
            userSelect: "none",
            zIndex: 1,
          }}
          title={`${el.label || ""} (${el.x}, ${el.y}, ${el.size})`}
        >
          {el.emoji || "❓"}
        </div>
      ))}

      {frame.caption && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "6px 12px",
            fontSize: 13,
          }}
        >
          {frame.caption}
        </div>
      )}

      {frame.action && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: mood.actionBg,
            color: mood.actionColor,
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 3,
            maxWidth: 200,
            zIndex: 1,
          }}
        >
          {frame.action}
        </div>
      )}
    </div>
  );
}

function exportCSV(frames) {
  const headers = ["Frame", "Background", "Shot", "Caption", "Action", "Label", "Emoji", "H-Pos", "V-Pos", "Size"];
  const rows = [headers.join(",")];
  frames.forEach((f, fi) => {
    if (f.elements.length === 0) {
      rows.push([fi + 1, `"${f.background}"`, f.shot, `"${f.caption}"`, `"${f.action}"`, "", "", "", "", ""].join(","));
    }
    f.elements.forEach((el) => {
      rows.push(
        [fi + 1, `"${f.background}"`, f.shot, `"${f.caption}"`, `"${f.action}"`, el.label || "", el.emoji || "", el.x, el.y, el.size].join(",")
      );
    });
  });

  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "storyboard.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [frames, setFrames] = useState([{ ...EMPTY_FRAME }]);
  const [activeFrame, setActiveFrame] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ai");
  const [showPlayer, setShowPlayer] = useState(false);
  const textareaRef = useRef(null);

  const current = frames[activeFrame] || EMPTY_FRAME;

  const updateFrame = (patch) => {
    setFrames((prev) => prev.map((f, i) => (i === activeFrame ? { ...f, ...patch } : f)));
  };

  const generate = async (mode = "new") => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");

    try {
      // Send all existing frames as context for continuity
      const previousFrames = mode === "new" ? frames : frames.filter((_, i) => i !== activeFrame);
      const resp = await fetch("http://localhost:3001/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: prompt, previousFrames }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();

      if (mode === "new") {
        setFrames((prev) => [...prev, data]);
        setActiveFrame(frames.length);
      } else {
        updateFrame(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const addElement = (emoji, label = "", x = "center", y = "ground", size = "medium") => {
    updateFrame({ elements: [...current.elements, { emoji, label, x, y, size }] });
  };

  const removeElement = (idx) => {
    updateFrame({ elements: current.elements.filter((_, i) => i !== idx) });
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui", background: "#111", color: "#e0e0e0" }}>
      {/* Left Panel */}
      <div style={{ width: 320, borderRight: "1px solid #333", display: "flex", flexDirection: "column", background: "#1a1a1a" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #333" }}>
          {[["ai", "AI"], ["assets", "Assets"], ["frame", "Frame"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: "10px 0", background: tab === k ? "#333" : "transparent",
                color: tab === k ? "#fff" : "#888", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {tab === "ai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) generate("new"); }}
                placeholder='Describe a scene... e.g. "The wizard and villain duel in the dungeon, wide shot"'
                style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", borderRadius: 6, padding: 10, fontSize: 13, resize: "vertical", minHeight: 80, fontFamily: "system-ui" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => generate("new")}
                  disabled={loading || !prompt.trim()}
                  style={{ flex: 1, padding: "8px 0", background: loading ? "#444" : "#4a9eff", color: "#fff", border: "none", borderRadius: 6, cursor: loading ? "default" : "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  {loading ? "Generating..." : "+ New Frame"}
                </button>
                <button
                  onClick={() => generate("replace")}
                  disabled={loading || !prompt.trim()}
                  style={{ padding: "8px 12px", background: loading ? "#444" : "#666", color: "#fff", border: "none", borderRadius: 6, cursor: loading ? "default" : "pointer", fontSize: 13 }}
                >
                  Replace
                </button>
              </div>
              {error && (
                <div style={{ background: "#3a1111", border: "1px solid #662222", borderRadius: 6, padding: 8, fontSize: 12, color: "#ff8888" }}>
                  {error}
                </div>
              )}
              <div style={{ fontSize: 11, color: "#555", lineHeight: 1.4 }}>
                Cmd+Enter to generate. Uses claude CLI on the backend.
              </div>
            </div>
          )}

          {tab === "assets" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "#888" }}>Type or paste an emoji and click Add to place it on the frame.</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  id="emoji-input"
                  placeholder="🐱"
                  style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", padding: "6px 10px", borderRadius: 4, fontSize: 24, width: 60, textAlign: "center" }}
                />
                <input
                  id="emoji-label"
                  placeholder="label (optional)"
                  style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", padding: 6, borderRadius: 4, fontSize: 13, flex: 1 }}
                />
                <button
                  onClick={() => {
                    const emoji = document.getElementById("emoji-input").value.trim();
                    const label = document.getElementById("emoji-label").value.trim();
                    if (emoji) addElement(emoji, label);
                  }}
                  style={{ background: "#4a9eff", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  Add
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>On Frame</div>
              {current.elements.length === 0 && <div style={{ fontSize: 12, color: "#555" }}>No elements yet</div>}
              {current.elements.map((el, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#222", padding: "4px 8px", borderRadius: 4, fontSize: 12 }}>
                  <span style={{ fontSize: 18 }}>{el.emoji}</span>
                  <span style={{ color: "#aaa", flex: 1 }}>{el.label || ""} · {el.x} · {el.y} · {el.size}</span>
                  <button onClick={() => removeElement(i)} style={{ background: "#522", border: "none", color: "#f88", borderRadius: 3, cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>x</button>
                </div>
              ))}
            </div>
          )}

          {tab === "frame" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#888" }}>Background (search query)</label>
              <input value={current.background} onChange={(e) => updateFrame({ background: e.target.value })} placeholder="e.g. dark forest, ocean sunset" style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", padding: 6, borderRadius: 4 }} />

              <label style={{ fontSize: 11, color: "#888" }}>Shot Type</label>
              <select value={current.shot} onChange={(e) => updateFrame({ shot: e.target.value })} style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", padding: 6, borderRadius: 4 }}>
                {["Wide Shot", "Medium Shot", "Close-Up", "Bird's Eye", "Low Angle", "Dutch Angle"].map((s) => <option key={s}>{s}</option>)}
              </select>

              <label style={{ fontSize: 11, color: "#888" }}>Caption</label>
              <input value={current.caption} onChange={(e) => updateFrame({ caption: e.target.value })} style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", padding: 6, borderRadius: 4 }} />

              <label style={{ fontSize: 11, color: "#888" }}>Action Note</label>
              <input value={current.action} onChange={(e) => updateFrame({ action: e.target.value })} style={{ background: "#222", border: "1px solid #444", color: "#e0e0e0", padding: 6, borderRadius: 4 }} />

              <label style={{ fontSize: 11, color: "#888" }}>Elements</label>
              {current.elements.map((el, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#222", padding: "4px 8px", borderRadius: 4, fontSize: 12 }}>
                  <span style={{ fontSize: 18 }}>{el.emoji || "?"}</span>
                  <span style={{ color: "#aaa", flex: 1 }}>{el.label || ""} · {el.x} · {el.y} · {el.size}</span>
                  <button onClick={() => removeElement(i)} style={{ background: "#522", border: "none", color: "#f88", borderRadius: 3, cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #333", gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Storyboard</span>
          <span style={{ fontSize: 12, color: "#666" }}>Frame {activeFrame + 1} / {frames.length}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowPlayer(true)}
            disabled={frames.filter(f => f.elements.length > 0).length < 2}
            style={{ background: frames.filter(f => f.elements.length > 0).length >= 2 ? "#4a9eff" : "#333", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          >
            Play
          </button>
          <button onClick={() => exportCSV(frames)} style={{ background: "#2a6a2a", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Export CSV
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 900 }}>
            <FrameCanvas frame={current} />
          </div>
        </div>

        <div style={{ borderTop: "1px solid #333", padding: "8px 16px", display: "flex", gap: 8, overflowX: "auto", alignItems: "center" }}>
          {frames.map((f, i) => (
            <button
              key={i}
              onClick={() => setActiveFrame(i)}
              style={{ width: 100, height: 56, flexShrink: 0, background: f.background ? `url(${bgUrl(f.background)}) center/cover` : FALLBACK_BG, border: i === activeFrame ? "2px solid #4a9eff" : "2px solid #333", borderRadius: 6, cursor: "pointer", position: "relative", overflow: "hidden" }}
            >
              <span style={{ position: "absolute", bottom: 2, left: 4, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "0 4px", borderRadius: 2 }}>{i + 1}</span>
              {f.elements.slice(0, 3).map((el, j) => (
                <span key={j} style={{ position: "absolute", left: `${20 + j * 25}%`, top: "30%", fontSize: 14 }}>{el.emoji || "?"}</span>
              ))}
            </button>
          ))}
          <button
            onClick={() => { setFrames((prev) => [...prev, { ...EMPTY_FRAME }]); setActiveFrame(frames.length); }}
            style={{ width: 50, height: 56, flexShrink: 0, background: "#222", border: "2px dashed #444", borderRadius: 6, cursor: "pointer", color: "#888", fontSize: 20 }}
          >
            +
          </button>
          {frames.length > 1 && (
            <button
              onClick={() => { setFrames((prev) => prev.filter((_, i) => i !== activeFrame)); setActiveFrame(Math.max(0, activeFrame - 1)); }}
              style={{ width: 50, height: 56, flexShrink: 0, background: "#2a1111", border: "2px solid #442222", borderRadius: 6, cursor: "pointer", color: "#f88", fontSize: 14 }}
            >
              Del
            </button>
          )}
        </div>
      </div>
      {showPlayer && (
        <Player
          frames={frames.filter(f => f.elements.length > 0)}
          onClose={() => setShowPlayer(false)}
        />
      )}
    </div>
  );
}
