// @vitest-environment jsdom
/**
 * Renderer UI test for the Games page.
 *
 * Covers the §15 games list: supported (CS2), not-configured (VALORANT) and
 * coming-soon (PUBG / Apex / LoL) rows are rendered, and CS2 flips between
 * Connected / Standby off the live connection state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { GamesPage } from "./GamesPage";
import { useApp } from "../state/useApp";

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <GamesPage />
    </ThemeProvider>,
  );
}

describe("GamesPage", () => {
  beforeEach(() => {
    useApp.setState({ gameConnected: false, lcuConnected: false });
  });

  it("lists supported, not-configured and coming-soon games", () => {
    renderPage();
    expect(screen.getByText("CS2")).toBeInTheDocument();
    expect(screen.getByText("League of Legends")).toBeInTheDocument();
    expect(screen.getByText("VALORANT")).toBeInTheDocument();
    expect(screen.getByText("PUBG")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured").length).toBe(1);
    // PUBG + Apex remain coming-soon (LoL graduated to "supported").
    expect(screen.getAllByText("Coming Soon").length).toBe(2);
  });

  it("shows both supported games (CS2 + LoL) as Standby while disconnected", () => {
    renderPage();
    expect(screen.getAllByText("○ Standby").length).toBe(2);
  });

  it("shows CS2 as Connected once the game is connected", () => {
    useApp.setState({ gameConnected: true });
    renderPage();
    expect(screen.getByText("● Connected")).toBeInTheDocument();
  });

  it("flips LoL to Connected once the League client is present", () => {
    useApp.setState({ lcuConnected: true });
    renderPage();
    expect(screen.getAllByText("● Connected").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("League of Legends")).toBeInTheDocument();
  });

  it("offers the CS2 GSI setup guidance and copy button", () => {
    renderPage();
    expect(screen.getByText("Copy GSI config")).toBeInTheDocument();
    // Both supported adapters document a non-invasive interface (CS2 GSI, LoL LCU).
    expect(screen.getAllByText(/No injection, no memory reads/i).length).toBe(2);
  });

  it("every game card exposes an expandable §20 legal & compatibility panel", async () => {
    renderPage();
    // One disclosure per game (CS2 + VALORANT + PUBG + Apex + LoL).
    expect(screen.getAllByText("Legal & Compatibility").length).toBe(5);

    const user = userEvent.setup();
    await user.click(screen.getAllByText("Legal & Compatibility")[0]); // CS2 is first

    // Opening CS2's panel reveals the GSI legal posture + known limitations.
    expect(screen.getByText("Interface")).toBeInTheDocument();
    expect(screen.getByText(/official HTTP status push/i)).toBeInTheDocument();
    expect(screen.getByText("No injection")).toBeInTheDocument();
    expect(screen.getByText("Known limitations")).toBeInTheDocument();
    expect(screen.getByText(/Requires user to add/i)).toBeInTheDocument();
  });

  it("opens only the clicked game's legal panel", async () => {
    renderPage();
    const user = userEvent.setup();
    // [1] is now LoL (the second supported adapter); its panel must show the
    // LCU legal posture and must NOT leak VALORANT's or CS2's content.
    await user.click(screen.getAllByText("Legal & Compatibility")[1]);
    expect(screen.getByText(/League Client local API/i)).toBeInTheDocument();
    expect(screen.queryByText(/Riot does not expose an official game-state API/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/official HTTP status push/i)).not.toBeInTheDocument();
  });
});