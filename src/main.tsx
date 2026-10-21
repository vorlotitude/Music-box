import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { App } from "./App";
import { GlobalStyle, theme } from "./theme";
import { AppProvider } from "./state/AppProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {/* HashRouter: the app is loaded from file:// in the packaged Electron
          build, where BrowserRouter cannot resolve the pathname and the
          <Routes> render blank. Hash routing works identically in dev (vite)
          and in packaged file:// mode. */}
      <HashRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>,
);