// @vitest-environment jsdom
/**
 * Renderer UI test for the §8 virtual-microphone install/consent step.
 *
 * The virtual mic is a separate, opt-in Windows loopback driver. Until it is
 * installed and confirmed, the UI must surface a "not installed" state, walk the
 * user through setup + consent, and only flip the flag on explicit confirmation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { VirtualMicSetup } from "./VirtualMicSetup";
import { useApp } from "../state/useApp";

function renderSetup() {
  return render(
    <ThemeProvider theme={theme}>
      <VirtualMicSetup />
    </ThemeProvider>,
  );
}

describe("VirtualMicSetup", () => {
  beforeEach(() => {
    useApp.setState({ settings: { ...useApp.getState().settings, virtualMicInstalled: false } });
  });

  it("reports not-installed by default and prompts for the driver", () => {
    renderSetup();
    expect(screen.getByTestId("vm-status")).toHaveTextContent("NOT INSTALLED");
    expect(screen.getByText(/separate, opt-in driver is needed/i)).toBeInTheDocument();
  });

  it("keeps the confirm button locked until consent is given", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("vm-toggle")); // reveal setup steps

    const confirm = screen.getByTestId("vm-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.click(screen.getByTestId("vm-consent"));
    expect(confirm.disabled).toBe(false);
  });

  it("only marks the driver installed after explicit install + consent confirmation", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("vm-toggle"));
    expect(useApp.getState().settings.virtualMicInstalled).toBe(false);

    await user.click(screen.getByTestId("vm-consent"));
    await user.click(screen.getByTestId("vm-confirm"));

    expect(useApp.getState().settings.virtualMicInstalled).toBe(true);
    expect(screen.getByTestId("vm-status")).toHaveTextContent("INSTALLED");
    expect(screen.getByTestId("vm-enabled-note")).toBeInTheDocument();
  });

  it("informs the user about the driver, permissions and anti-cheat posture", async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByTestId("vm-toggle"));
    expect(screen.getByText(/separate loopback driver/i)).toBeInTheDocument();
    expect(screen.getByText(/system device driver/i)).toBeInTheDocument();
    expect(screen.getByText(/never bypasses game voice, permissions, or anti-cheat/i)).toBeInTheDocument();
  });
});