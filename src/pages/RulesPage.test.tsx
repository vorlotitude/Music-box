// @vitest-environment jsdom
/**
 * Renderer UI test for the visual Rule Builder (RulesPage).
 *
 * Covers the "Create Rule" leg of the §28 UI flow: the user picks an event in
 * WHEN, adds an optional condition in IF, and saves. The rule must be written
 * to the store AND attached to the currently-selected Music Box. The store
 * runs on the in-memory bridge mock, and `controllerRef.current` is null here
 * so `reloadRules()` is a no-op.
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { RulesPage } from "./RulesPage";
import { useApp } from "../state/useApp";
import type { MusicBox } from "@core/rules/Rule";
import type { AudioAsset } from "@core/library/AudioAsset";

const box: MusicBox = {
  id: "box1", name: "Chaotic Victory", description: "", game: "cs2",
  rules: [], volume: 1, createdAt: 1, updatedAt: 1, enabled: true,
};

const asset: AudioAsset = {
  id: "a1", filePath: "/m/victory.mp3", title: "Victory", artist: "",
  album: "", duration: 10, genre: "", tags: [], category: "music",
  volume: 1, favorite: false, addedAt: 1, playCount: 0,
};

function renderPage() {
  useApp.setState({ ready: true, assets: [asset], boxes: [box], rules: [] });
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={["/?box=box1"]}>
        <RulesPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

/** Comboboxes appear in JSX order: box, event, asset, actionType, priority, cooldown, route. */
function selects() {
  return screen.getAllByRole("combobox");
}

describe("RulesPage visual rule builder", () => {
  it("shows the builder and auto-selects the first audio asset as the reaction", async () => {
    renderPage();
    expect(screen.getByText("NEW RULE")).toBeInTheDocument();
    const assetPick = selects()[2];
    await waitFor(() => expect(assetPick).toHaveValue("a1"));
    expect(screen.getAllByText("Victory").length).toBeGreaterThan(0); // chip + option
  });

  it("creates a rule for the chosen event and binds it to the selected box", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(selects()[1], "ROUND_LOSS");

    await user.click(screen.getByRole("button", { name: /create rule/i }));

    await waitFor(() => {
      const saved = useApp.getState().rules.find((r) => r.event === "ROUND_LOSS");
      expect(saved).toBeTruthy();
      expect(saved!.action.type).toBe("PLAY_AUDIO");
      if (saved!.action.type === "PLAY_AUDIO") {
        expect(saved!.action.assetId).toBe("a1");
      }
      expect(saved!.priority).toBe(50);
      expect(saved!.cooldownMs).toBe(8000);
      expect(saved!.game).toBe("cs2");
    });
    // The rule must also be attached to the selected Music Box.
    await waitFor(() => {
      const { rules } = useApp.getState();
      expect(rules.length).toBe(1);
      const bx = useApp.getState().boxes.find((b) => b.id === "box1")!;
      expect(bx.rules).toContain(rules[0].id);
      expect(bx.rules.length).toBe(1);
    });
  });

  it("binds the reaction by dragging a track onto the slot (§14)", async () => {
    const user = userEvent.setup();
    renderPage();
    useApp.setState({
      assets: [asset, { ...asset, id: "a2", title: "Clown", category: "sfx" }],
    });
    const dt: any = (() => {
      const m = new Map<string, string>();
      return {
        setData: (k: string, v: string) => m.set(k, v),
        getData: (k: string) => m.get(k) ?? "",
        types: [], effectAllowed: "", dropEffect: "",
      };
    })();

    fireEvent.dragStart(await screen.findByTitle("Clown"), { dataTransfer: dt });
    fireEvent.drop(screen.getByTestId("then-slot"), { dataTransfer: dt });

    await waitFor(() => expect(selects()[2]).toHaveValue("a2"));
    await userEvent.click(screen.getByRole("button", { name: /create rule/i }));
    await waitFor(() => {
      const saved = useApp.getState().rules[0];
      expect(saved).toBeTruthy();
      if (saved!.action.type === "PLAY_AUDIO") expect(saved!.action.assetId).toBe("a2");
    });
  });

  it("shows a live JSON preview in Advanced mode (§13)", async () => {
    const json = () => screen.getByTestId("rule-json");
    renderPage();
    expect(screen.queryByTestId("rule-json")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /advanced/i }));
    expect(json().textContent).toContain('"event": "ROUND_WIN"');
    expect(json().textContent).toContain('"cooldownMs": 8000');

    // The preview tracks builder edits in real time (event → ROUND_LOSS).
    await userEvent.selectOptions(selects()[1], "ROUND_LOSS");
    expect(json().textContent).toContain('"event": "ROUND_LOSS"');
  });

  it("includes an added IF condition in the saved rule", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText(/add condition/i));
    // A condition row (field + operator selects) appears before THEN.
    await user.click(screen.getByRole("button", { name: /create rule/i }));

    await waitFor(() => {
      const saved = useApp.getState().rules[0];
      expect(saved).toBeTruthy();
      expect(saved!.conditions).toHaveLength(1);
      expect(saved!.conditions[0]).toMatchObject({
        field: "session.winStreak",
        operator: ">=",
        value: 2,
      });
    });
  });
});