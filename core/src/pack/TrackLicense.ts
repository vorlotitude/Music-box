/**
 * Music Pack / track licensing model (§19).
 *
 * Phase 1 ships user's OWN local files only — those need no license, so
 * imported assets default to carrying no license. This model is the *reservation*
 * for a future official Music Pack channel: when (and only when) a real grant is
 * obtained, a TrackLicense is attached and the UI may show the
 * "Licensed for Game Music Box" badge.
 *
 * The rights enumerated here (distribution, synchronization, public
 * performance / communication) are deliberately mirrors of what a music
 * license grants. We do NOT assume what a grant covers — each field must be
 * filled from an actual license. This is not legal advice.
 */

/** Broad categories describing the nature of the grant. */
export type LicenseType =
  | "user-owned" // user imported their own file — no third-party grant needed
  | "royalty-free" // license explicitly permits commercial/redistribution
  | "standard" // a negotiated per-track grant
  | "custom"; // ad-hoc agreement; scope fields carry the truth

/** The app currently distributes worldwide; overridable for testing. */
export const DEFAULT_DISTRIBUTION_TERRITORY = "worldwide";

export interface TrackLicense {
  /** Audio asset id (or future pack track id) this license covers. */
  trackId: string;
  title: string;
  artist: string;
  copyrightOwner: string;
  licenseType: LicenseType;
  /** Comma-separated ISO territory codes, or "worldwide". */
  territory: string;
  /** ISO yyyy-mm-dd start of the grant. */
  startDate: string;
  /** ISO yyyy-mm-dd end, or null for perpetual. */
  endDate: string | null;
  commercialUse: boolean;
  distributionRights: boolean;
  synchronizationRights: boolean;
  publicPerformanceCommunicationRights: boolean;
  /** Where the grant came from (informational). */
  source: "self" | "vendor";
}

function parseISO(iso: string | null): number {
  if (!iso) return Number.NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * True only if the license is (a) within its grant window and (b) covers the
 * requested distribution territory. This is the core §19 gate.
 */
export function licenseCoversForApp(
  l: TrackLicense,
  now = new Date(),
  territory = DEFAULT_DISTRIBUTION_TERRITORY,
): boolean {
  const start = parseISO(l.startDate);
  const end = l.endDate != null ? parseISO(l.endDate) : Infinity;
  if (Number.isNaN(start)) return false;
  const withinWindow = start <= now.getTime() && now.getTime() <= end;

  const requested = territory.trim().toLowerCase();
  const territories = l.territory
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const territoryCovered =
    territories.includes("worldwide") || territories.includes(requested);

  return withinWindow && territoryCovered;
}

/**
 * Gate for surfacing the "Licensed for Game Music Box" badge. A badge may only
 * appear on a track whose license is live, covers the territory, AND grants
 * distribution rights (we would otherwise not be allowed to redistribute it).
 */
export function canShowLicensedBadge(
  l: TrackLicense,
  now = new Date(),
  territory = DEFAULT_DISTRIBUTION_TERRITORY,
): boolean {
  return licenseCoversForApp(l, now, territory) && l.distributionRights;
}

/** True if a license is attached (per asset; undefined = user's own file). */
export function hasLicense(a: { license?: TrackLicense } | undefined | null): boolean {
  return !!a?.license;
}