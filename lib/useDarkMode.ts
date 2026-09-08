import { useEffect, useState } from "react";

const STORAGE_KEY = "fgl-theme";

/**
 * Reads/writes the "dark" class on <html> that pages/_document.tsx's inline
 * script already applied pre-hydration (see that file's comment for why).
 * This hook just syncs React state to match what's already on the DOM, and
 * persists the user's explicit choice so it sticks across visits.
 */
export function useDarkMode(): [boolean, () => void] {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing / storage disabled -- the toggle still works for
      // this page load, it just won't be remembered next time.
    }
  }

  return [isDark, toggle];
}
