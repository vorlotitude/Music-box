// @vitest-environment jsdom
/**
 * First-run Onboarding wizard.
 *
 * A fresh install (settings.onboarded === false) must show the onboarding flow
 * instead of the full app. Finishing it persists onboarded=true and the user
 * lands on Home. Importing local audio is a no-op path in tests (mock bridge).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { MemoryRouter } from "react-router-dom";
import { theme } from "../theme";
import { OnboardingPage } from "./OnboardingPage";
import { useApp } from "../state/useApp";
import { bridge } from "../bridge";

vi.mock("../bridge", () => ({
  bridge: {
    openAudioFiles: vi.fn(async () => [] as { path: string; name: string; size: number }[]),
    settingsSave: vi.fn(async () => ({}) as Record<string, unknown>),
  },
}));

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Onboarding", () => {
  beforeEach(() => {
    useApp.setState({ settings: useApp.getState().settings, assets: [] });
  });

  it("walks through the 5 steps and finishes into the app", async () => {
    const user = userEvent.setup();
    renderPage();

    // Step 1 Welcome
    expect(screen.getByText(/Welcome to Game Music Box/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /get started/i }));

    // Step 2 Choose Game
    expect(screen.getByText(/choose your game/i)).toBeInTheDocument();
    expect(screen.getByText(/Counter-Strike 2/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 Import Music (skip)
    expect(screen.getByText(/import your music/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    // Step 4 Create first Music Box (skip)
    expect(screen.getByText(/create your first music box/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    // Step 5 Finish → persists onboarded
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start using/i }));
    expect(bridge.settingsSave).toHaveBeenCalledWith(expect.objectContaining({ onboarded: true }));
    expect(useApp.getState().settings.onboarded).toBe(true);
  });
});