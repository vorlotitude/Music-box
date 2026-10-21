import { canShowLicensedBadge } from "@core/pack/TrackLicense";
import type { AudioAsset } from "@core/library/AudioAsset";
import { Pill } from "./ui";
import { useT } from "../i18n";

/**
 * "Licensed for Game Music Box" badge (§19).
 * Renders ONLY when the asset actually carries a live, territory-covered license
 * with distribution rights — never as a marketing default.
 */
export function LicenseBadge({ asset }: { asset: Pick<AudioAsset, "license"> }) {
  const t = useT();
  if (!asset.license || !canShowLicensedBadge(asset.license)) return null;
  return (
    <Pill
      tone="ok"
      title={t("license.tooltip")}
      data-testid="licensed-badge"
      style={{ marginLeft: 8 }}
    >
      {t("license.title")}
    </Pill>
  );
}