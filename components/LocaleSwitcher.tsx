import React, { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";

/** Optional CSS class override for the switcher button. */
interface LocaleSwitcherProps {
  /** Every locale code the site routes (e.g. `["en", "it"]`). */
  locales: string[];
  /** The locale code for the page this component is rendered on. */
  currentLocale: string;
  /** Display name per locale code (e.g. `{ en: "English", it: "Italiano" }`). Falls back to the raw code when omitted. */
  labels?: Record<string, string>;
  /** Additional CSS classes applied to the trigger button. */
  className?: string;
}

/**
 * Floating language switcher for sites using a `src/pages/[locale]/...`
 * routing layer. Navigates to the same path with only the leading locale
 * segment swapped — relies on every locale having a page at that path (a
 * missing translation still resolves, rendered with default-locale content,
 * rather than 404ing — see the site's own content-fallback logic), so no
 * per-page URL mapping is needed here.
 *
 * Purely a navigation mechanism: it does not know or care how translations
 * are organized, only that swapping the URL's first path segment is enough.
 *
 * Must be hydrated with `client:load`.
 *
 * @example
 * ```astro
 * <LocaleSwitcher
 *   client:load
 *   locales={["en", "it"]}
 *   currentLocale={locale}
 *   labels={{ en: "English", it: "Italiano" }}
 * />
 * ```
 */
const LocaleSwitcher: React.FC<LocaleSwitcherProps> = ({ locales, currentLocale, labels = {}, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  const go = (locale: string) => {
    if (locale === currentLocale) {
      setIsOpen(false);
      return;
    }
    const { pathname, search, hash } = window.location;
    const rest = pathname.replace(new RegExp(`^/${currentLocale}(/|$)`), "/");
    window.location.href = `/${locale}${rest}${search}${hash}`;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: "fixed", bottom: "1.25rem", left: "1.25rem", zIndex: 1040 }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(p => !p)}
        aria-label={`Language: ${labels[currentLocale] ?? currentLocale}. Click to change.`}
        aria-expanded={isOpen}
        style={{
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
        <Globe size={18} />
      </button>
      {isOpen && (
        <ul
          style={{
            position: "absolute",
            bottom: "calc(100% + 0.5rem)",
            left: 0,
            margin: 0,
            padding: "0.35rem",
            listStyle: "none",
            minWidth: "8rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--bs-border-color)",
            background: "var(--bs-body-bg)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
          }}
        >
          {locales.map(locale => (
            <li key={locale}>
              <button
                type="button"
                onClick={() => go(locale)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: locale === currentLocale ? "var(--bs-tertiary-bg)" : "transparent",
                  color: "var(--bs-body-color)",
                  border: "none",
                  borderRadius: "0.375rem",
                  padding: "0.5rem 0.75rem",
                  fontWeight: locale === currentLocale ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {labels[locale] ?? locale}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LocaleSwitcher;
