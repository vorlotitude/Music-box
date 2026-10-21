// @vitest-environment jsdom
/**
 * Renderer UI test for the Music Box management page.
 *
 * Covers the "Create Music Box" / Duplicate / Delete leg of the §28 UI flow.
 * Creating a box writes it to the store and navigates to its rule editor;
 * duplicating deep-copies referenced rules with fresh ids; deleting removes the
 * box after a confirm. The store runs on the in-memory bridge mock.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { MusicBoxesPage } from "./MusicBoxesPage";
import { useApp } from "../state/useApp";
import type { MusicBox, Rule } from "@core/rules/Rule";

function box(id: string, name: string, ruleIds: string[] = [], enabled = true): MusicBox {
  return { id, name, description: "", game: "cs2", rules: ruleIds, volume: 1, enabled, createdAt: 1, updatedAt: 1 };
}

function seed() {
  // A box referencing one enabled rule, so duplicate/delete act on real data.
  const rule: Rule = {
    id: "r1", name: "Victory", game: "cs2", event: "ROUND_WIN", conditions: [],
    action: { type: "PLAY_AUDIO", assetId: "a1" },
    priority: 100, cooldownMs: 8000, route: "SELF_ONLY", enabled: true,
  };
  useApp.setState({
    ready: true,
    assets: [],
    boxes: [box("b1", "Chaotic Victory", ["r1"])],
    rules: [rule],
  });
}

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={["/boxes"]}>
        <MusicBoxesPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("MusicBoxesPage", () => {
  beforeEach(() => {
    useApp.setState({ boxes: [], rules: [], assets: [] });
  });

  it("lists each box with its rule count and active status", () => {
    seed();
    renderPage();
    expect(screen.getByText("Chaotic Victory")).toBeInTheDocument();
    expect(screen.getByText(/1 rules · 1 active/)).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("creates a new empty box and saves it to the store", async () => {
    const user = userEvent.setup();
    // Empty library → nothing listed initially.
    renderPage();
    await user.click(screen.getByRole("button", { name: /new music box/i }));
    await waitFor(() => {
      const saved = useApp.getState().boxes[0];
      expect(saved).toBeTruthy();
      expect(saved!.name).toMatch(/^New Box \d+/);
      expect(saved!.rules).toEqual([]); // new box starts with zero rules
    });
  });

  it("duplicates a box by deep-copying its referenced rules with fresh ids", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();

    const card = screen.getByText("Chaotic Victory").closest("div")!.parentElement!;
    await user.click(within(card as HTMLElement).getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      const { boxes, rules } = useApp.getState();
      const copies = boxes.filter((b) => b.name.includes("(copy)"));
      expect(copies).toHaveLength(1);
      const copy = copies[0];
      // The copied box references a NEW rule id, and the original rule still exists.
      expect(copy.rules).toHaveLength(1);
      expect(copy.rules![0]).not.toBe("r1");
      expect(rules.find((r) => r.id === copy.rules![0])?.name).toBe("Victory (copy)");
      expect(rules.find((r) => r.id === "r1")).toBeTruthy();
    });
  });

  it("deletes a box only after confirmation", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    expect(screen.getByText("Chaotic Victory")).toBeInTheDocument();

    // Cancel → box stays.
    viConfirm(false);
    await user.click(getDeleteButton("Chaotic Victory"));
    await waitFor(() => expect(useApp.getState().boxes).toHaveLength(1));

    // Confirm → box removed.
    viConfirm(true);
    await user.click(getDeleteButton("Chaotic Victory"));
    await waitFor(() => {
      expect(useApp.getState().boxes).toHaveLength(0);
      expect(screen.queryByText("Chaotic Victory")).not.toBeInTheDocument();
    });
  });

  it("AI Generate: turns a prompt into a box and applies it (§22)", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();

    await user.click(screen.getByRole("button", { name: /AI Generate/i }));
    await user.type(screen.getByTestId("ai-prompt"), "输五把以后给我放最搞笑的音乐");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    // Preview appears with the mapped event and a loss-streak condition.
    const preview = screen.getByTestId("ai-preview");
    expect(within(preview as HTMLElement).getByText("ROUND_LOSS")).toBeInTheDocument();
    expect(within(preview as HTMLElement).getByText(/lossStreak/i)).toBeInTheDocument();

    // Applying it writes a box + its rules into the store.
    const apply = screen.getByTestId("ai-apply");
    expect(apply).toBeEnabled();
    await user.click(apply);

    await waitFor(() => {
      const { boxes, rules } = useApp.getState();
      const created = boxes.find((b) => b.name.includes("Meme"));
      expect(created).toBeTruthy();
      const rule = rules.find((r) => r.id === created!.rules[0]);
      expect(rule?.event).toBe("ROUND_LOSS");
      expect(rule?.conditions[0]?.value).toBe(5);
    });
  });
});

function getDeleteButton(name: string): HTMLElement {
  const card = screen.getByText(name).closest("div")!.parentElement!;
  return within(card as HTMLElement).getByRole("button", { name: /delete/i });
}

function viConfirm(result: boolean) {
  vi.spyOn(window, "confirm").mockReturnValue(result);
}