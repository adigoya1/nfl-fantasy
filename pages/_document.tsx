import { Html, Head, Main, NextScript } from "next/document";

/**
 * Custom Document, needed for exactly one thing: a tiny inline script that
 * applies the "dark" class to <html> BEFORE React hydrates. Doing this in a
 * useEffect in Layout would work too, but there'd be a flash of light mode
 * on every page load for anyone who's chosen dark -- this script runs
 * synchronously as the page parses, so there's no flash.
 *
 * Preference order: an explicit choice saved in localStorage (from the
 * toggle in components/Layout.tsx), then the OS-level prefers-color-scheme,
 * then light as the final fallback.
 */
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("fgl-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
