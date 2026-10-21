// @vitest-environment jsdom
/**
 * Renderer UI test for the Settings page.
 *
 * Covers the §16 settings surface: all required sections render, bus volumes
 * persist to the store on change, and ducking pivot reveals the duck-level
 * control.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { SettingsPage } from "./SettingsPage";
import { useApp, DEFAULT_SETTINGS } from "../state/useApp";

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <SettingsPage />
    </ThemeProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    useApp.setState({ settings: { ...DEFAULT_SETTINGS, ducking: false } });
  });

  it("renders all required settings sections", () => {
    renderPage();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("Game")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Output Routing")).toBeInTheDocument();
    expect(screen.getByText("Privacy & Local-First")).toBeInTheDocument();
  });

  it("persists a bus volume change into the settings store", () => {
    renderPage();
    // First slider is Master Volume (set to 90 by default).
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "40" } });
    expect(useApp.getState().settings.masterVolume).toBe(0.4);
  });

  it("toggling ducking reveals the duck-level control", async () => {
    const user = userEvent.setup();
    renderPage();
    // Duck level is hidden while ducking is disabled.
    expect(screen.queryByText("Duck level")).not.toBeInTheDocument();
    // Locate the Ducking toggle by its label inside the Audio card (order-independent).
    const duckingLabel = screen.getByText("Ducking");
    const duckingToggle = duckingLabel.closest("div")?.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await user.click(duckingToggle);
    expect(useApp.getState().settings.ducking).toBe(true);
    expect(screen.getByText("Duck level")).toBeInTheDocument();
  });

  it("keeps all settings local-first defaults intact", () => {
    renderPage();
    expect(useApp.getState().settings.minimizeToTray).toBe(true);
    // Privacy card explicitly states no uploads / no auto-fetch.
    expect(screen.getByText(/stored locally/i)).toBeInTheDocument();
  });
});