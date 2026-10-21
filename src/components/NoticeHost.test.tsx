// @vitest-environment jsdom
/**
 * Renderer UI test for the NoticeHost (§26 user-facing error host).
 *
 * Notices pushed into the store surface as dismissible toasts; dismissing
 * removes them. Keeps engine-level failures visible without crashing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { NoticeHost } from "./NoticeHost";
import { useApp } from "../state/useApp";

function renderHost() {
  return render(
    <ThemeProvider theme={theme}>
      <NoticeHost />
    </ThemeProvider>,
  );
}

describe("NoticeHost", () => {
  beforeEach(() => {
    useApp.setState({ notices: [] });
  });

  it("renders pushed notices as toasts", () => {
    useApp.setState({
      notices: [
        { id: "n1", kind: "error", text: "Audio unavailable for Budget: file missing." },
        { id: "n2", kind: "info", text: "Game disconnected — game events are paused." },
      ],
    });
    renderHost();
    expect(screen.getByText(/Audio unavailable for Budget/i)).toBeInTheDocument();
    expect(screen.getByText(/Game disconnected/i)).toBeInTheDocument();
  });

  it("dismisses a notice when its close button is clicked", async () => {
    const user = userEvent.setup();
    useApp.setState({
      notices: [{ id: "n1", kind: "warn", text: "A temporary warning." }],
    });
    renderHost();

    expect(screen.getByText("A temporary warning.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("A temporary warning.")).not.toBeInTheDocument();
    expect(useApp.getState().notices).toHaveLength(0);
  });

  it("leaves the host empty when there are no notices", () => {
    renderHost();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });
});