import React, { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

/** Must match the key the `scms()` integration's anti-FOUC head script reads/writes — see `scms.ts`. */
const STORAGE_KEY = "scms-theme";

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

/** Click order: System -> Light -> Dark -> System -> ... */
const CYCLE: ThemePreference[] = ["system", "light", "dark"];

const LABELS: Record<ThemePreference, string> = {
  system: "Auto (follows system)",
  light: "Light",
  dark: "Dark",
};

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Reads the stored preference, defaulting to "system" for anything else (absent, or a stale/foreign value). */
function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? (prefersDark() ? "dark" : "light") : preference;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
}

/** Optional CSS class override for the toggle button. */
interface ThemeToggleProps {
  /** Additional CSS classes applied to the toggle button. */
  className?: string;
}

/**
 * Floating three-state (system / light / dark) theme toggle. Clicking cycles
 * through the three; while on "system" the resolved theme follows the OS's
 * `prefers-color-scheme` live, including changes made after the page loaded
 * (e.g. an OS's scheduled light/dark switch) — this is the standard pattern
 * (GitHub, VS Code, Bootstrap's own docs all default to "system" and only
 * pin to an explicit theme once the user overrides it).
 *
 * Flips Bootstrap 5.3's `data-bs-theme` attribute on `<html>` and persists
 * the choice to `localStorage` ("system" is stored as the *absence* of a
 * key, so a user who never touches the toggle keeps following the OS
 * indefinitely). Pairs with the inline anti-FOUC script `scms()` injects
 * into every page's `<head>` (see `scms.ts`), which sets the same attribute
 * from `localStorage`/`prefers-color-scheme` before first paint.
 *
 * A site's own `global.css` supplies the actual dark palette as
 * `[data-bs-theme="dark"]` overrides of its light-mode custom properties;
 * this component only owns the toggle mechanism.
 *
 * Must be hydrated with `client:load`.
 *
 * @example
 * ```astro
 * <ThemeToggle client:load />
 * ```
 */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  // Starts "system" on both server and first client render so hydration
  // never mismatches; corrected to the real stored value in the effect
  // below, which only runs client-side after `document`/`localStorage` exist.
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(readStoredPreference());

    // Live-follow the OS while (and only while) "system" is the active
    // preference. Reads localStorage directly at fire time rather than
    // closing over `preference`, so this stays correct without having to
    // resubscribe every time the preference changes.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (readStoredPreference() === "system") {
        applyTheme(resolveTheme("system"));
      }
    };
    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, []);

  const cycle = () => {
    const next = CYCLE[(CYCLE.indexOf(preference) + 1) % CYCLE.length];
    setPreference(next);
    try {
      if (next === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // localStorage unavailable (private browsing, disabled storage) — theme still applies for this page view.
    }
    applyTheme(resolveTheme(next));
  };

  const next = CYCLE[(CYCLE.indexOf(preference) + 1) % CYCLE.length];
  const icon =
    preference === "system" ? <Monitor size={18} /> : preference === "dark" ? <Moon size={18} /> : <Sun size={18} />;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABELS[preference]}. Click to switch to ${LABELS[next]}.`}
      title={`Theme: ${LABELS[preference]}`}
      className={className}
      style={{
        position: "fixed",
        bottom: "1.25rem",
        right: "1.25rem",
        zIndex: 1040,
        width: "2.75rem",
        height: "2.75rem",
        borderRadius: "50%",
        border: "1px solid var(--bs-border-color)",
        background: "var(--bs-body-bg)",
        color: "var(--bs-body-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
};

export default ThemeToggle;
