/**
 * Inline before paint: set data-theme to avoid FOUC.
 * Prefer stored choice, else system preference, else dark (space default).
 */
export function ThemeScript() {
  const code = `(function(){try{var k='helix-theme';var s=localStorage.getItem(k)||localStorage.getItem('non-os-theme');var t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: code }}
      suppressHydrationWarning
    />
  );
}
