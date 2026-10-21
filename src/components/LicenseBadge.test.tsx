// @vitest-environment jsdom
/**
 * §19 UI gate: the "Licensed for Game Music Box" badge must render only when a
 * real, live, territory-covered license with distribution rights exists — and
 * never for ordinary user-imported local files.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { LicenseBadge } from "./LicenseBadge";
import type { TrackLicense } from "@core/pack/TrackLicense";

function lic(over: Partial<TrackLicense> = {}): TrackLicense {
  return {
    trackId: "t1",
    title: "Neon Drive",
    artist: "Example Artist",
    copyrightOwner: "Example Publisher",
    licenseType: "standard",
    territory: "worldwide",
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    commercialUse: true,
    distributionRights: true,
    synchronizationRights: true,
    publicPerformanceCommunicationRights: true,
    source: "vendor",
    ...over,
  };
}

function renderBadge(asset: { license?: TrackLicense }) {
  return render(
    <ThemeProvider theme={theme}>
      <LicenseBadge asset={asset} />
    </ThemeProvider>,
  );
}

describe("LicenseBadge (§19)", () => {
  it("renders nothing for a normal user-imported file (no license)", () => {
    const { container } = renderBadge({});
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("licensed-badge")).not.toBeInTheDocument();
  });

  it("renders the badge only for a live, covered, distribution-enabled grant", () => {
    renderBadge({ license: lic() });
    expect(screen.getByTestId("licensed-badge")).toBeInTheDocument();
    expect(screen.getByText("Licensed for Game Music Box")).toBeInTheDocument();
  });

  it("suppresses the badge when distribution rights are missing", () => {
    const { container } = renderBadge({ license: lic({ distributionRights: false }) });
    expect(container).toBeEmptyDOMElement();
  });

  it("suppresses the badge once the grant has expired", () => {
    const { container } = renderBadge({ license: lic({ endDate: "2026-06-01" }) });
    expect(container).toBeEmptyDOMElement();
  });

  it("suppresses the badge outside the covered territory", () => {
    const { container } = renderBadge({ license: lic({ territory: "US,CA" }) });
    expect(container).toBeEmptyDOMElement();
  });
});