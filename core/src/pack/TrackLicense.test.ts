import { describe, it, expect } from "vitest";
import {
  TrackLicense,
  licenseCoversForApp,
  canShowLicensedBadge,
  hasLicense,
  DEFAULT_DISTRIBUTION_TERRITORY,
} from "./TrackLicense";

const NOW = new Date("2026-09-09T00:00:00Z");

function license(over: Partial<TrackLicense> = {}): TrackLicense {
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

describe("licenseCoversForApp (§19)", () => {
  it("covers worldwide territory inside the grant window", () => {
    expect(licenseCoversForApp(license(), NOW)).toBe(true);
  });

  it("rejects an expired license", () => {
    expect(licenseCoversForApp(license({ endDate: "2026-06-01" }), NOW)).toBe(false);
  });

  it("rejects a license before it starts", () => {
    expect(licenseCoversForApp(license({ startDate: "2027-01-01" }), NOW)).toBe(false);
  });

  it("treats a null endDate as perpetual", () => {
    expect(licenseCoversForApp(license({ endDate: null }), NOW)).toBe(true);
  });

  it("rejects when it does not cover the requested territory", () => {
    const l = license({ territory: "US,CA" });
    expect(licenseCoversForApp(l, NOW, "DE")).toBe(false);
    expect(licenseCoversForApp(l, NOW, "us")).toBe(true); // case-insensitive
  });

  it("rejects a license with a malformed start date (cannot verify)", () => {
    expect(licenseCoversForApp(license({ startDate: "someday" }), NOW)).toBe(false);
  });

  it("exports a distribution territory constant", () => {
    expect(DEFAULT_DISTRIBUTION_TERRITORY).toBe("worldwide");
  });
});

describe("canShowLicensedBadge (§19)", () => {
  it("shows the badge only when distribution rights are granted", () => {
    expect(canShowLicensedBadge(license(), NOW)).toBe(true);
    expect(canShowLicensedBadge(license({ distributionRights: false }), NOW)).toBe(false);
  });

  it("never shows outside the covered territory/window", () => {
    expect(canShowLicensedBadge(license({ territory: "JP" }), NOW, "KR")).toBe(false);
    expect(canShowLicensedBadge(license({ endDate: "2026-06-01" }), NOW)).toBe(false);
  });
});

describe("hasLicense", () => {
  it("false for the common case: user's own imported file carries no license", () => {
    expect(hasLicense({} as never)).toBe(false);
    expect(hasLicense(null)).toBe(false);
    expect(hasLicense(undefined)).toBe(false);
  });

  it("true once a license is attached", () => {
    expect(hasLicense({ license: license() })).toBe(true);
  });
});