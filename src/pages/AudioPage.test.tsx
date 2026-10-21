// @vitest-environment jsdom
/**
 * Renderer UI test for the Audio page.
 *
 * Covers the §8 mixer/routing surface: the four bus levels are rendered from
 * live settings, and choosing an output target persists to the settings store
 * (speaker / both / virtualMic), keeping the routing abstraction real and
 * writable from the UI rather than a static label.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { AudioPage } from "./AudioPage";
import { useApp } from "../state/useApp";

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <AudioPage />
    </ThemeProvider>,
  );
}

describe("AudioPage", () => {
  beforeEach(() => {
    useApp.setState({ settings: { ...useApp.getState().settings, outputTarget: "speaker", musicVolume: 0.8, sfxVolume: 1, voiceVolume: 1, masterVolume: 0.9, ducking: false } });
  });

  it("renders the mixer buses with live percentages", () => {
    renderPage();
    // Bus labels are always present.
    expect(screen.getByText("Music")).toBeInTheDocument();
    expect(screen.getByText("SFX")).toBeInTheDocument();
    expect(screen.getByText("Voice")).toBeInTheDocument();
    // Percent texts from the bus rows (80 Music, 100 SFX, 100 Voice, 90 master).
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("90% master")).toBeInTheDocument();
  });

  it("shows the current output target as selected", () => {
    renderPage();
    expect(screen.getAllByText("Headphones / Speakers").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SELECTED/i)).toHaveTextContent("SELECTED");
  });

  it("persists a new output target on click", async () => {
    const user = userEvent.setup();
    renderPage();
    // Default speaker; switch to virtualMic. The heading at the bottom is the same text,
    // so the test has to find by exact match from the button's children.
    const [btn] = screen.getAllByText("Virtual Microphone");
    await user.click(btn.closest("button")!);
    expect(useApp.getState().settings.outputTarget).toBe("virtualMic");
    expect(screen.getByText("Both")).toBeInTheDocument(); // option list intact
  });

  it("maps the routing intents to concrete sinks", () => {
    renderPage();
    expect(screen.getByText("SELF ONLY")).toBeInTheDocument();
    // "SPEAKER" appears for the SELF_ONLY route and in the (speaker-default) output node.
    expect(screen.getAllByText("SPEAKER").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a pending-driver warning for virtual-mic output until the driver is confirmed", () => {
    useApp.setState({ settings: { ...useApp.getState().settings, outputTarget: "virtualMic", virtualMicInstalled: false } });
    const first = renderPage();
    // Selecting a virtual-mic target while uninstalled must not go silent: the
    // mixer output node falls back to SPEAKER and a driver-setup pill is shown.
    expect(screen.getByTestId("pending-virtualMic")).toHaveTextContent("PENDING");
    expect(screen.getAllByText(/falls back to your speakers/i).length).toBeGreaterThanOrEqual(1);

    // After the user confirms the driver, the same target is live — no pill.
    first.unmount();
    useApp.setState({ settings: { ...useApp.getState().settings, virtualMicInstalled: true } });
    renderPage();
    expect(screen.queryByTestId("pending-virtualMic")).not.toBeInTheDocument();
  });
});