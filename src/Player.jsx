import { useState, useEffect, useRef, useCallback } from "react";

const FRAME_DURATION = 4000; // ms per keyframe hold
const TRANSITION_DURATION = 2000; // ms to interpolate between frames
const SEGMENT = FRAME_DURATION + TRANSITION_DURATION;

const FALLBACK_BG = "linear-gradient(180deg, #2a2a3a 0%, #1a1a2a 100%)";

function bgUrl(query) {
  if (!query) return null;
  return `http://localhost:3001/api/bg?q=${encodeURIComponent(query)}`;
}

// Ease in-out cubic
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Match elements between two frames by label (same label = same character/prop)
function matchElements(frameA, frameB) {
  const a = frameA?.elements || [];
  const b = frameB?.elements || [];
  const matched = []; // { from, to, label, emoji }
  const usedB = new Set();

  // Match by label
  a.forEach((elA) => {
    if (!elA.label) return;
    const idx = b.findIndex((elB, i) => !usedB.has(i) && elB.label === elA.label);
    if (idx !== -1) {
      matched.push({ from: elA, to: b[idx], label: elA.label, emoji: b[idx].emoji || elA.emoji });
      usedB.add(idx);
    }
  });

  // Match by emoji for unlabeled
  a.forEach((elA) => {
    if (elA.label && matched.some((m) => m.from === elA)) return;
    const idx = b.findIndex((elB, i) => !usedB.has(i) && elB.emoji === elA.emoji);
    if (idx !== -1) {
      matched.push({ from: elA, to: b[idx], label: elA.label || elB?.label || "", emoji: elA.emoji });
      usedB.add(idx);
    }
  });

  // Exiting: in A but not matched
  const exiting = a.filter((elA) => !matched.some((m) => m.from === elA));

  // Entering: in B but not matched
  const entering = b.filter((_, i) => !usedB.has(i));

  return { matched, exiting, entering };
}

function InterpolatedCanvas({ frames, progress, totalDuration }) {
  if (!frames || frames.length === 0) return null;

  const totalSegments = frames.length - 1;
  const totalTime = totalDuration;

  // Figure out which segment we're in
  const rawPos = (progress / 100) * totalTime;

  let segIdx, segProgress;
  if (frames.length === 1) {
    segIdx = 0;
    segProgress = 0;
  } else {
    segIdx = Math.min(Math.floor(rawPos / SEGMENT), totalSegments - 1);
    const segTime = rawPos - segIdx * SEGMENT;

    if (segTime <= FRAME_DURATION) {
      // Holding on keyframe
      segProgress = 0;
    } else {
      // Transitioning to next
      segProgress = ease(Math.min((segTime - FRAME_DURATION) / TRANSITION_DURATION, 1));
    }
  }

  const frameA = frames[segIdx];
  const frameB = frames[Math.min(segIdx + 1, frames.length - 1)];
  const t = segIdx >= totalSegments ? 0 : segProgress;

  const { matched, exiting, entering } = matchElements(frameA, frameB);

  const bgChanging = frameA.background !== frameB.background;

  // Interpolate caption/action
  const showAText = t < 0.5;
  const textOpacity = t === 0 ? 1 : showAText ? 1 - t * 2 : (t - 0.5) * 2;
  const caption = showAText ? frameA.caption : frameB.caption;
  const action = showAText ? frameA.action : frameB.action;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: FALLBACK_BG,
        borderRadius: 8,
        overflow: "hidden",
        border: "2px solid #333",
      }}
    >
      {/* Background A */}
      {frameA.background && (
        <img
          src={bgUrl(frameA.background)}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: bgChanging ? 1 - t : 1,
            transition: "none",
          }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      )}

      {/* Background B (crossfade) */}
      {bgChanging && frameB.background && (
        <img
          src={bgUrl(frameB.background)}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: t,
            transition: "none",
          }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      )}

      {/* Matched elements — interpolate position and size */}
      {matched.map((m, i) => (
        <div
          key={`m-${m.label || i}`}
          style={{
            position: "absolute",
            left: `${lerp(m.from.x ?? 50, m.to.x ?? 50, t)}%`,
            top: `${lerp(m.from.y ?? 50, m.to.y ?? 50, t)}%`,
            transform: "translate(-50%, -50%)",
            fontSize: lerp(m.from.size ?? 60, m.to.size ?? 60, t),
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            zIndex: 2,
            userSelect: "none",
          }}
        >
          {m.emoji}
        </div>
      ))}

      {/* Exiting elements — fade out */}
      {exiting.map((el, i) => (
        <div
          key={`exit-${el.label || i}`}
          style={{
            position: "absolute",
            left: `${el.x ?? 50}%`,
            top: `${el.y ?? 50}%`,
            transform: "translate(-50%, -50%)",
            fontSize: el.size ?? 60,
            opacity: 1 - t,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            zIndex: 2,
            userSelect: "none",
          }}
        >
          {el.emoji || "❓"}
        </div>
      ))}

      {/* Entering elements — fade in */}
      {entering.map((el, i) => (
        <div
          key={`enter-${el.label || i}`}
          style={{
            position: "absolute",
            left: `${el.x ?? 50}%`,
            top: `${el.y ?? 50}%`,
            transform: "translate(-50%, -50%)",
            fontSize: el.size ?? 60,
            opacity: t,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            zIndex: 2,
            userSelect: "none",
          }}
        >
          {el.emoji || "❓"}
        </div>
      ))}

      {/* Caption — crossfade */}
      {caption && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "8px 16px",
            fontSize: 15,
            opacity: textOpacity,
            zIndex: 3,
          }}
        >
          {caption}
        </div>
      )}

      {/* Action note — crossfade */}
      {action && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 4,
            maxWidth: 220,
            opacity: textOpacity,
            zIndex: 3,
          }}
        >
          {action}
        </div>
      )}

      {/* Frame counter */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          zIndex: 3,
        }}
      >
        {segIdx + 1} / {frames.length}
      </div>
    </div>
  );
}

export default function Player({ frames, onClose }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const pauseTimeRef = useRef(0);

  const totalDuration = Math.max((frames.length - 1) * SEGMENT + FRAME_DURATION, FRAME_DURATION);

  const tick = useCallback((timestamp) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current + pauseTimeRef.current;
    const pct = Math.min((elapsed / totalDuration) * 100, 100);
    setProgress(pct);

    if (pct < 100) {
      animRef.current = requestAnimationFrame(tick);
    } else {
      setPlaying(false);
    }
  }, [totalDuration]);

  useEffect(() => {
    if (playing) {
      startTimeRef.current = null;
      animRef.current = requestAnimationFrame(tick);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      // Save current elapsed time so we can resume
      if (startTimeRef.current !== null) {
        pauseTimeRef.current = (progress / 100) * totalDuration;
      }
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, tick]);

  const handleScrub = (e) => {
    const pct = parseFloat(e.target.value);
    setProgress(pct);
    pauseTimeRef.current = (pct / 100) * totalDuration;
    startTimeRef.current = null;
  };

  const restart = () => {
    pauseTimeRef.current = 0;
    startTimeRef.current = null;
    setProgress(0);
    setPlaying(true);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.95)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16, background: "transparent",
          border: "1px solid #555", color: "#aaa", padding: "4px 12px", borderRadius: 4,
          cursor: "pointer", fontSize: 13, zIndex: 101,
        }}
      >
        Close
      </button>

      {/* Canvas */}
      <div style={{ width: "80%", maxWidth: 1100 }}>
        <InterpolatedCanvas frames={frames} progress={progress} totalDuration={totalDuration} />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, width: "80%", maxWidth: 1100 }}>
        <button
          onClick={() => setPlaying(!playing)}
          style={{
            background: "#333", border: "1px solid #555", color: "#fff",
            width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={restart}
          style={{
            background: "#333", border: "1px solid #555", color: "#fff",
            width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
            fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ⏮
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          onChange={handleScrub}
          onMouseDown={() => setPlaying(false)}
          style={{ flex: 1, accentColor: "#4a9eff" }}
        />
        <span style={{ color: "#888", fontSize: 12, width: 80, textAlign: "right" }}>
          {Math.round((progress / 100) * totalDuration / 1000)}s / {Math.round(totalDuration / 1000)}s
        </span>
      </div>

      {/* Frame markers on timeline */}
      <div style={{ width: "80%", maxWidth: 1100, position: "relative", height: 20, marginTop: 4, paddingLeft: 92, paddingRight: 80 }}>
        {frames.map((f, i) => {
          const pct = frames.length <= 1 ? 0 : (i * SEGMENT / totalDuration) * 100;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: 0,
                fontSize: 9,
                color: "#666",
                transform: "translateX(-50%)",
              }}
            >
              F{i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}
