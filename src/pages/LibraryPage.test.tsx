// @vitest-environment jsdom
/**
 * Renderer UI test for the Library page.
 *
 * Covers the search/filter/remove rendering leg of the §28 audio library flow.
 * Also verifies the store-level `importFiles` path that the Import buttons call
 * (writes assets via the in-memory bridge mock) without requiring an OS dialog.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { LibraryPage } from "./LibraryPage";
import { bridge } from "../bridge";
import { useApp } from "../state/useApp";
import type { AudioAsset } from "@core/library/AudioAsset";

function asset(id: string, title: string, category: AudioAsset["category"]): AudioAsset {
  return {
    id, filePath: `/m/${id}.mp3`, title, artist: "", album: "", duration: 10,
    genre: "", tags: [], category, volume: 1, favorite: false, addedAt: 1, playCount: 0,
  };
}

function seed() {
  useApp.setState({
    ready: true,
    assets: [
      asset("a1", "Victory", "music"),
      asset("a2", "Clown", "sfx"),
      asset("a3", "Gg", "voice"),
    ],
    boxes: [],
    rules: [],
  });
}

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("LibraryPage", () => {
  beforeEach(() => {
    useApp.setState({ assets: [], boxes: [], rules: [] });
  });

  it("lists imported assets with their category", () => {
    seed();
    renderPage();
    expect(screen.getByText("Victory")).toBeInTheDocument();
    expect(screen.getByText("Clown")).toBeInTheDocument();
    expect(screen.getByText("Gg")).toBeInTheDocument();
    expect(screen.getAllByText("music")).toHaveLength(1);
  });

  it("filters by category chip", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    await user.click(screen.getByText(/SFX \(1\)/i));
    expect(screen.getByText("Clown")).toBeInTheDocument();
    expect(screen.queryByText("Victory")).not.toBeInTheDocument();
    expect(screen.queryByText("Gg")).not.toBeInTheDocument();
    // Count display reflects the filter
    expect(screen.getByText(/All \(3\)/i)).toBeInTheDocument();
  });

  it("searches by title", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    await user.type(screen.getByPlaceholderText(/search your library/i), "clown");
    expect(screen.getByText("Clown")).toBeInTheDocument();
    expect(screen.queryByText("Victory")).not.toBeInTheDocument();
    expect(screen.queryByText("Gg")).not.toBeInTheDocument();
  });

  it("imports new files through the store path (Import Files flow)", async () => {
    seed();
    await useApp.getState().importFiles([
      { path: "/m/new.mp3", name: "New Track.mp3", size: 1024 },
    ]);
    expect(useApp.getState().assets).toHaveLength(4);
    const added = useApp.getState().assets.find((a) => a.id !== "a1" && a.id !== "a2" && a.id !== "a3");
    expect(added?.title).toBe("New Track");
    expect(added?.category).toBe("imported");
  });

  it("removes an asset", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    const row = screen.getByText("Victory").closest("tr")!;
    const trash = within(row as HTMLElement).getAllByRole("button").at(-1)!;
    await user.click(trash);
    await waitFor(() => {
      expect(useApp.getState().assets.some((a) => a.title === "Victory")).toBe(false);
    });
  });

  it("opens the asset editor and updates metadata on save", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    const row = screen.getByText("Victory").closest("tr")!;
    // Row buttons: [0]=favorite, [1]=play, [2]=edit, [3]=remove.
    const edit = within(row as HTMLElement).getAllByRole("button")[2];
    await user.click(edit);

    // Modal opens with the current values pre-filled (title input shows "Victory").
    expect(screen.getByText(/Edit Asset — Victory/i)).toBeInTheDocument();
    const titleInput = screen.getByDisplayValue("Victory");
    expect(titleInput).toBeInstanceOf(HTMLInputElement);

    // Change metadata: title, artist, category, tags.
    await user.clear(titleInput);
    await user.type(titleInput, "Epic Victory");
    await user.type(screen.getByPlaceholderText("Artist"), "Chip");
    // The category dropdown is the combo box that isn't the library sort select.
    const catSelect = screen
      .getAllByRole("combobox")
      .find((c) => c.getAttribute("aria-label") !== "Sort library")!;
    await user.selectOptions(catSelect, "sfx");
    const tagsInput = screen.getByPlaceholderText("cinematic, meme, victory");
    await user.clear(tagsInput);
    // Set full text in one change to verify comma split logic works.
    fireEvent.change(tagsInput, { target: { value: "epic, clutch" } });

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const saved = useApp.getState().assets.find((a) => a.id === "a1");
    expect(saved?.title).toBe("Epic Victory");
    expect(saved?.artist).toBe("Chip");
    expect(saved?.category).toBe("sfx");
    // Typing comma-separated tags produced a split array.
    expect(saved?.tags).toEqual(["epic", "clutch"]);
    // Modal closed after save.
    expect(screen.queryByText(/Edit Asset —/i)).not.toBeInTheDocument();
  });

  it("picks a cover image via the file chooser and saves it (§5)", async () => {
    const user = userEvent.setup();
    seed();
    const spy = vi.spyOn(bridge, "pickImage").mockResolvedValue("/covers/victory.png");
    renderPage();
    const row = screen.getByText("Victory").closest("tr")!;
    await user.click(within(row as HTMLElement).getAllByRole("button")[2]); // edit

    // Browse opens the picker; the picked path lands in the cover field.
    await user.click(screen.getByTestId("cover-browse"));
    await waitFor(() => {
      expect((screen.getByTestId("cover-path") as HTMLInputElement).value).toBe("/covers/victory.png");
    });

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(useApp.getState().assets.find((a) => a.id === "a1")?.coverPath).toBe("/covers/victory.png");
    spy.mockRestore();
  });

  it("shows a cover thumbnail when a track has cover art, fallback otherwise (§14)", async () => {
    seed();
    useApp.setState({
      assets: [
        { ...asset("a1", "Victory", "music"), coverPath: "/covers/victory.png" },
        asset("a2", "Clown", "sfx"),
      ],
    });
    renderPage();

    // Track with a cover renders an <img> pointing at the appmedia:// URL.
    await waitFor(() => {
      const img = screen.getByTestId("cover-thumb");
      expect((img as HTMLImageElement).src).toContain("/covers/victory.png");
    });

    // Tracks without a cover render the placeholder glyph.
    const row = screen.getByText("Clown").closest("tr")!;
    expect(within(row as HTMLElement).getByTestId("cover-fallback")).toBeInTheDocument();
  });

  it("cancels the editor without mutating the asset", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    const row = screen.getByText("Victory").closest("tr")!;
    const edit = within(row as HTMLElement).getAllByRole("button")[2];
    await user.click(edit);
    const titleInput = screen.getByDisplayValue("Victory");
    await user.clear(titleInput);
    await user.type(titleInput, "ShouldNotSave");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(useApp.getState().assets.find((a) => a.id === "a1")?.title).toBe("Victory");
    expect(screen.queryByText(/Edit Asset —/i)).not.toBeInTheDocument();
  });

  it("toggles favorite and filters by favorites (♥)", async () => {
    const user = userEvent.setup();
    seed();
    renderPage();
    const row = screen.getByText("Victory").closest("tr")!;
    const star = within(row as HTMLElement).getAllByRole("button")[0];
    await user.click(star);
    expect(useApp.getState().assets.find((a) => a.title === "Victory")?.favorite).toBe(true);
    // Favorites-only view now shows just that track.
    await user.click(screen.getByText(/★ Favorites \(1\)/i));
    expect(screen.getByText("Victory")).toBeInTheDocument();
    expect(screen.queryByText("Clown")).not.toBeInTheDocument();
  });

  it("shows duration and per-asset rule-usage count", () => {
    seed();
    useApp.setState({
      rules: [
        {
          id: "r1", name: "Win", game: "cs2", event: "ROUND_WIN", conditions: [],
          action: { type: "PLAY_AUDIO", assetId: "a1" }, priority: 50, cooldownMs: 0,
          route: "SELF_ONLY", enabled: true, createdAt: 1, updatedAt: 1,
        },
      ],
    });
    renderPage();
    const row = screen.getByText("Victory").closest("tr")!;
    const cells = within(row as HTMLElement).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(expect.arrayContaining(["0:10"])); // duration mm:ss
    const usedCell = within(row as HTMLElement)
      .getAllByRole("cell").filter((c) => c.textContent?.trim() === "1");
    expect(usedCell.length).toBeGreaterThan(0); // used by 1 rule
  });
});