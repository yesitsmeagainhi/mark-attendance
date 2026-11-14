"use client";

import { useEffect, useState } from "react";

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac with touch
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

/** "denied" = the site isn't allowed to use location; "off" = phone GPS/location is off or no fix. */
function errorKind(error: string): "denied" | "off" {
  return /permission|denied|not allowed/i.test(error) ? "denied" : "off";
}

const STEPS: Record<Platform, Record<"denied" | "off", string[]>> = {
  android: {
    off: ["Swipe down from the top of the screen.", "Tap Location to turn it on.", "Come back here; it retries automatically."],
    denied: [
      "Tap the ⓘ or lock icon next to the web address (in the app: long-press the app icon → App info).",
      "Open Permissions → Location → Allow.",
      "Come back here and tap Try again.",
    ],
  },
  ios: {
    off: ["Open the Settings app.", "Privacy & Security → Location Services → turn it on.", "Come back here; it retries automatically."],
    denied: [
      "Open Settings → Privacy & Security → Location Services → Safari Websites → While Using the App.",
      "Back in Safari, tap aA in the address bar → Website Settings → Location → Allow.",
      "Come back here and tap Try again.",
    ],
  },
  desktop: {
    off: ["Turn on location for your computer (Windows: Settings → Privacy & security → Location).", "Then tap Try again."],
    denied: ["Click the lock icon next to the web address → Location → Allow.", "Then tap Try again."],
  },
};

/**
 * Help shown when the punch screen can't get the location: what's wrong,
 * a shortcut to the phone's location settings where the browser allows it,
 * and step-by-step instructions otherwise. Retries automatically when the
 * employee comes back from Settings.
 */
export default function LocationHelp({ error, onRetry, onClose, dark = false }: {
  error: string;
  onRetry: () => void;
  onClose?: () => void;
  /** Styling for the black camera screen */
  dark?: boolean;
}) {
  const [platform] = useState<Platform>(detectPlatform);
  const kind = errorKind(error);
  const steps = STEPS[platform][kind];
  // Android shortcut, tried one tap at a time: GPS switch → main Settings → give up (show steps)
  const [attempt, setAttempt] = useState<"location" | "phone" | "failed">(kind === "off" ? "location" : "phone");
  const highlightSteps = attempt === "failed";

  // Back from Settings → try again straight away
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") onRetry();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onRetry]);

  // Chrome reports a refused settings link by sending us back to this page with #settings-refused
  useEffect(() => {
    function onHash() {
      if (window.location.hash !== "#settings-refused") return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setAttempt((a) => (a === "location" ? "phone" : "failed"));
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function openSettings() {
    const tried = attempt;
    const next = tried === "location" ? "phone" : "failed";
    const action = tried === "location" ? "android.settings.LOCATION_SOURCE_SETTINGS" : "android.settings.SETTINGS";
    const fallback = `${window.location.href.split("#")[0]}#settings-refused`;
    let left = false;
    const markLeft = () => { if (document.visibilityState === "hidden") left = true; };
    document.addEventListener("visibilitychange", markLeft);
    window.location.href = `intent:#Intent;action=${action};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
    // Some browsers neither open Settings nor report it: treat "still here" as refused
    setTimeout(() => {
      document.removeEventListener("visibilitychange", markLeft);
      if (!left && document.visibilityState === "visible") {
        // Only if Chrome's refusal hasn't already moved us on
        setAttempt((a) => (a === tried ? next : a));
      }
    }, 2000);
  }

  const fg = dark ? "#fff" : "var(--ink)";
  const muted = dark ? "rgba(255,255,255,.75)" : "var(--muted)";

  return (
    <div
      role="alert"
      style={{
        background: dark ? "rgba(20,20,28,.94)" : "#fff7ed",
        border: dark ? "1px solid rgba(255,255,255,.18)" : "1px solid #fed7aa",
        borderRadius: 14, padding: "14px 16px", color: fg, textAlign: "left", fontSize: 14, lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <b style={{ fontSize: 15 }}>{kind === "denied" ? "Location is blocked for this app" : "Turn on location to punch"}</b>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: "none", color: muted, fontSize: 20, lineHeight: 1, padding: 0, cursor: "pointer" }}>&times;</button>
        )}
      </div>
      <p style={{ margin: "4px 0 10px", color: muted }}>
        Your location is saved with every punch, so it has to be on.
      </p>

      {platform === "android" && attempt !== "failed" && (
        <button type="button" className="primary" onClick={openSettings} style={{ margin: "0 0 10px", padding: "11px 14px", fontSize: 15 }}>
          {attempt === "location" ? "Open location settings" : "Open phone settings"}
        </button>
      )}
      {platform === "android" && attempt === "phone" && kind === "off" && (
        <p style={{ margin: "-4px 0 10px", color: muted, fontSize: 13 }}>Couldn&apos;t open the location switch directly. Try the main Settings screen, then tap Location.</p>
      )}

      <ol style={{
        margin: "0 0 10px", paddingLeft: 20, color: fg,
        ...(highlightSteps ? { outline: `2px solid ${dark ? "#fbbf24" : "#f59e0b"}`, outlineOffset: 4, borderRadius: 6 } : {}),
      }}>
        {steps.map((s) => <li key={s} style={{ marginBottom: 2 }}>{s}</li>)}
      </ol>
      {highlightSteps && <p style={{ margin: "0 0 10px", color: muted, fontSize: 13 }}>This phone&apos;s browser doesn&apos;t allow opening Settings from a web page. Please follow the steps above.</p>}

      <button type="button" className="secondary" onClick={onRetry} style={{ margin: 0, padding: "10px 14px", fontSize: 15 }}>
        Try again
      </button>
    </div>
  );
}
