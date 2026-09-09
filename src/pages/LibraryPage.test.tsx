// @vitest-environment jsdom
/**
 * Renderer UI test for the Library page.
 *
 * Covers the search/filter/remove rendering leg of the §28 audio library flow.
 * Also verifies the store-level `importFiles` path that the Import buttons call
 * (writes assets via the in-memory bridge mock) without requiring an OS dialog.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { LibraryPage } from "./LibraryPage";
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
});