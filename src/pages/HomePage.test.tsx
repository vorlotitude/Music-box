// @vitest-environment jsdom
/**
 * Renderer UI test for the Home dashboard + Developer Mode.
 *
 * Covers the §11 dashboard (session stats, connection pill) and the §29
 * Developer Mode path: clicking a TEST event button must forward the exact
 * event type to the application controller (`controllerRef.current.testEvent`),
 * which is what drives the manual "Test Event" flow in the UI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { HomePage } from "./HomePage";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import type { MusicBox } from "@core/rules/Rule";

function box(id: string, name: string, ruleIds: string[] = []): MusicBox {
  return { id, name, description: "", game: "cs2", rules: ruleIds, volume: 1, enabled: true, createdAt: 1, updatedAt: 1 };
}

const rule = {
  id: "r1", name: "Victory", game: "cs2", event: "ROUND_WIN", conditions: [],
  action: { type: "PLAY_AUDIO" as const, assetId: "a1" },
  priority: 100, cooldownMs: 8000, route: "SELF_ONLY" as const, enabled: true,
};

function seed() {
  useApp.setState({
    ready: true,
    gameConnected: true,
    session: { kills: 18, deaths: 9, wins: 12, losses: 7 },
    assets: [],
    boxes: [box("b1", "Chaotic Victory", ["r1"])],
    rules: [rule],
    log: [{ ts: 1, kind: "event", message: "ROUND_WIN" }],
  });
}

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <HomePage />
    </ThemeProvider>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    useApp.setState({ boxes: [], rules: [], assets: [], log: [] });
  });

  it("renders the connection status and current session stats", () => {
    seed();
    renderPage();
    expect(screen.getByText("● Connected")).toBeInTheDocument();
    expect(screen.getByText(/Current Session · CS2/i)).toBeInTheDocument();
    // Numbers are rendered in stat cards; check by label presence.
    expect(screen.getAllByText("Kills").length).toBeGreaterThan(0);
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows disconnected pill when the game is not connected", () => {
    useApp.setState({ gameConnected: false });
    renderPage();
    expect(screen.getByText("○ Disconnected")).toBeInTheDocument();
  });

  it("lists the active music box and its enabled rules", () => {
    seed();
    renderPage();
    expect(screen.getByText("CHAOTIC VICTORY")).toBeInTheDocument();
    expect(screen.getByText(/Round Win/)).toBeInTheDocument();
  });

  it("Developer Mode: clicking TEST forwards the event type to the controller", async () => {
    const user = userEvent.setup();
    const testEvent = vi.fn();
    controllerRef.current = { testEvent } as any;
    try {
      seed();
      renderPage();

      // The Dev Bar hosts all eight TEST buttons.
      const dev = screen.getByText(/DEVELOPER \/ DEBUG MODE/i).closest("div")!.parentElement!;
      await user.click(within(dev as HTMLElement).getByRole("button", { name: /test kill/i }));
      await user.click(within(dev as HTMLElement).getByRole("button", { name: /test mvp/i }));
      await user.click(within(dev as HTMLElement).getByRole("button", { name: /test grenade/i }));

      expect(testEvent).toHaveBeenCalledTimes(3);
      expect(testEvent).toHaveBeenNthCalledWith(1, "PLAYER_KILL");
      expect(testEvent).toHaveBeenNthCalledWith(2, "MVP");
      expect(testEvent).toHaveBeenNthCalledWith(3, "GRENADE_THROW");
    } finally {
      controllerRef.current = null;
    }
  });
});