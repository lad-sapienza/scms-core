import React, { useState, useRef, useEffect } from "react";
import { Menu, X, ChevronRight } from "lucide-react";

/**
 * A single navigation link entry.
 *
 * - `href`  — URL the link points to. Optional for parent items that only open a dropdown.
 * - `label` — visible text.
 * - `match` — optional path prefix used for active detection (falls back to `href`).
 *   Useful when a parent item has no `href` but should be highlighted for a subtree,
 *   e.g. `match: "/docs"` highlights the "Docs" entry for any `/docs/*` page.
 * - `children` — nested items, enabling up to 3 levels of dropdown menus.
 */
interface MenuItem {
  href?: string;
  label: string;
  match?: string;
  children?: MenuItem[];
}

/** Brand / logo configuration for the navbar. */
interface BrandProps {
  /** Text displayed as the brand name. */
  text: string;
  /** URL the brand name links to. */
  link: string;
  /** Additional CSS classes applied to the brand anchor. */
  cssClasses?: string;
}

/** Optional CSS class overrides for individual navbar elements. */
interface CssClasses {
  /** Classes applied to the `<nav>` element. */
  nav?: string;
  /** Classes applied to the `<ul>` list. */
  ul?: string;
  /** Classes applied to each `<li>` item. */
  li?: string;
}

/**
 * Bootstrap-compatible responsive navbar with a React-controlled toggle.
 * Active state is computed internally from `currentPath` — no need to set
 * `isActive` on individual menu items.
 *
 * Menu data can be loaded from a YAML file (e.g. `src/content/data/menu.yaml`)
 * and passed straight to `menuItems`.
 *
 * Must be hydrated with `client:load` when used inside an Astro component.
 *
 * @example
 * ```astro
 * ---
 * import { getEntry } from 'astro:content';
 * const menuEntry = await getEntry('menu', 'menu');
 * ---
 * <BSNavbar
 *   client:load
 *   menuItems={menuEntry?.data ?? []}
 *   currentPath={Astro.url.pathname}
 *   cssClasses={{ nav: "sticky-top shadow-sm", ul: "ms-auto" }}
 *   brand={{ text: "My Site", link: "/" }}
 * />
 * ```
 *
 * @example YAML menu structure (`src/content/data/menu.yaml`)
 * ```yaml
 * - href: /
 *   label: Home
 * - label: Docs
 *   match: /docs
 *   children:
 *     - href: /docs/guides/getting-started
 *       label: Getting Started
 *     - label: Components
 *       children:
 *         - href: /docs/components/datatb
 *           label: DataTb
 * ```
 */
interface BSNavbarProps {
  /** Array of navigation items to render in the menu. */
  menuItems: MenuItem[];
  /**
   * Current page path (e.g. `Astro.url.pathname`).
   * Used internally to compute which items are active.
   */
  currentPath?: string;
  /** Optional CSS class overrides for navbar sub-elements. */
  cssClasses?: CssClasses;
  /** Optional brand / logo configuration. Omit to hide the brand area. */
  brand?: BrandProps;
}

// ---------------------------------------------------------------------------
// Active detection
// ---------------------------------------------------------------------------

/** Returns true when `item` (or any descendant) matches `currentPath`. */
function isItemActive(item: MenuItem, currentPath: string): boolean {
  const target = item.match ?? item.href;
  if (target) {
    // A target ending in "/" is an index page (e.g. "/" itself, or a
    // locale-prefixed home like "/it/") — match it exactly, otherwise
    // startsWith would make it "active" for every page beneath it too.
    const active = target.endsWith("/") ? currentPath === target : currentPath.startsWith(target);
    if (active) return true;
  }
  return item.children?.some(child => isItemActive(child, currentPath)) ?? false;
}

// ---------------------------------------------------------------------------
// DropdownItem — item inside a dropdown (level ≥ 2)
// ---------------------------------------------------------------------------
const DropdownItem: React.FC<{ item: MenuItem; currentPath: string }> = ({ item, currentPath }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const hasChildren = !!item.children?.length;
  const active = isItemActive(item, currentPath);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenLeft(rect.left > window.innerWidth / 2);
    }
    setIsOpen(p => !p);
  };

  if (!hasChildren) {
    return (
      <li>
        <a
          className={`dropdown-item${active ? " active" : ""}`}
          href={item.href ?? "#"}
        >
          {item.label}
        </a>
      </li>
    );
  }

  return (
    <li ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={`dropdown-item d-flex justify-content-between align-items-center${active ? " active" : ""}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        {item.label}
        <ChevronRight size={14} className="ms-2 flex-shrink-0" />
      </button>
      {isOpen && (
        <ul
          className={`dropdown-menu show scms-nested-dropdown${openLeft ? " scms-nested-dropdown--left" : ""}`}
        >
          {item.children!.map((child, i) => (
            <DropdownItem key={child.href ?? i} item={child} currentPath={currentPath} />
          ))}
        </ul>
      )}
    </li>
  );
};

// ---------------------------------------------------------------------------
// NavItem — top-level nav entry (level 1)
// ---------------------------------------------------------------------------
const NavItem: React.FC<{ item: MenuItem; currentPath: string; liClass?: string }> = ({ item, currentPath, liClass }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const hasChildren = !!item.children?.length;
  const active = isItemActive(item, currentPath);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  const liBase = `nav-item${hasChildren ? " dropdown" : ""}${active ? " active" : ""}${liClass ? ` ${liClass}` : ""}`;

  if (!hasChildren) {
    return (
      <li className={liBase} ref={ref}>
        <a className={`nav-link${active ? " active" : ""}`} href={item.href ?? "#"}>
          {item.label}
        </a>
      </li>
    );
  }

  return (
    <li className={liBase} ref={ref}>
      <button
        type="button"
        className={`nav-link dropdown-toggle${active ? " active" : ""}`}
        onClick={() => setIsOpen(p => !p)}
        aria-expanded={isOpen}
      >
        {item.label}
      </button>
      {isOpen && (
        <ul className="dropdown-menu show">
          {item.children!.map((child, i) => (
            <DropdownItem key={child.href ?? i} item={child} currentPath={currentPath} />
          ))}
        </ul>
      )}
    </li>
  );
};

// ---------------------------------------------------------------------------
// BSNavbar — root component
// ---------------------------------------------------------------------------
const BSNavbar: React.FC<BSNavbarProps> = ({ menuItems, currentPath = "/", cssClasses = {}, brand }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className={`navbar navbar-expand-md ${cssClasses.nav ?? ""}`}>
      {/*
        Third-level (and deeper) dropdowns cascade sideways on desktop
        (position: absolute; left/right: 100% — see DropdownItem below).
        Below Bootstrap's md breakpoint the navbar collapses into a
        single narrow column (navbar-expand-md), and a sideways flyout
        has nowhere to go but off the edge of the screen — unreachable,
        not just visually broken. Below md, this flips the same markup
        to flow inline instead, indented to show the hierarchy.
      */}
      <style>{`
        @media (max-width: 767.98px) {
          .scms-nested-dropdown {
            position: static !important;
            width: 100% !important;
            min-width: 0 !important;
            box-shadow: none !important;
            border: none !important;
            padding-left: 1rem;
          }
        }
        @media (min-width: 768px) {
          .scms-nested-dropdown {
            position: absolute;
            left: 100%;
            top: 0;
            min-width: 12rem;
          }
          .scms-nested-dropdown.scms-nested-dropdown--left {
            left: auto;
            right: 100%;
          }
        }
      `}</style>
      <div className="container">
        {brand && (
          <a className={`navbar-brand ${brand.cssClasses ?? ""}`} href={brand.link}>
            {brand.text}
          </a>
        )}
        <button
          className="navbar-toggler border-0 p-2"
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          aria-controls="navbarCollapse"
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className={`collapse navbar-collapse${isOpen ? " show" : ""}`} id="navbarCollapse">
          <ul className={`navbar-nav ${cssClasses.ul ?? ""}`}>
            {menuItems.map((item, i) => (
              <NavItem key={item.href ?? i} item={item} currentPath={currentPath} liClass={cssClasses.li} />
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default BSNavbar;
