import { createGlobalStyle } from "styled-components";

/**
 * Game Music Box design tokens — Spotify-2.0 × SFX-Rm × gaming-tool aesthetic.
 * Dark, premium, editorial, dense-but-clean, audio-centric.
 */
export const theme = {
  bg: "#08080b",
  bgElev: "#0e0e13",
  bgElev2: "#15151c",
  panel: "#121218",
  border: "#22222c",
  borderSoft: "#1a1a22",

  text: "#f2f0ea",
  textSoft: "#a9a8b3",
  textDim: "#6b6a78",

  accent: "#9b6cff",
  accent2: "#4f8fff",
  accentWarm: "#ff8b5c",
  success: "#2ce08a",
  danger: "#ff5c7a",
  warning: "#ffc85c",

  fontDisplay: "'Sora', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",

  radius: 14,
  radiusSm: 9,
  shadow: "0 20px 60px rgba(0,0,0,0.5)",
  glow: "0 0 24px rgba(155,108,255,0.35)",
} as const;

export type Theme = typeof theme;

export const GlobalStyle = createGlobalStyle`
  :root {
    color-scheme: dark;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body {
    font-family: ${theme.fontBody};
    background: ${theme.bg};
    color: ${theme.text};
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
  ::-webkit-scrollbar-track { background: transparent; }

  h1,h2,h3,h4 { font-family: ${theme.fontDisplay}; letter-spacing: -0.02em; }
  button { font-family: inherit; cursor: pointer; }
  input, select, textarea { font-family: inherit; }

  .nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;