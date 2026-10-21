import styled from "styled-components";
import { Headphones, Disc3, Volume2, Route } from "lucide-react";
import { useApp } from "../state/useApp";
import { PageHeader, Title, Subtitle, Card, Grid, Pill, Muted } from "../components/ui";
import { VirtualMicSetup } from "../components/VirtualMicSetup";
import { useT } from "../i18n";
import { routeToSinks, effectiveOutputSinks, outputNeedsVirtualMic } from "@core/audio/AudioRouter";
import type { OutputTarget } from "@core/audio/AudioRouter";
import type { AudioRoute } from "@core/events/GameEvent";

/** Per-route delivery summary, straight from the core audio router. */
const ROUTE_PREVIEW: { route: AudioRoute; labelKey: string; blurbKey: string }[] = [
  { route: "SELF_ONLY", labelKey: "audio.routeSelf", blurbKey: "audio.routeSelfBlurb" },
  { route: "TEAMMATES", labelKey: "audio.routeTeammates", blurbKey: "audio.routeTeammatesBlurb" },
  { route: "BOTH", labelKey: "audio.routeBoth", blurbKey: "audio.routeBothBlurb" },
];

const OUTPUT_OPTIONS = [
  { key: "speaker", labelKey: "audio.outSpeakers", blurbKey: "audio.outSpeakersBlurb" },
  { key: "both", labelKey: "audio.outBoth", blurbKey: "audio.outBothBlurb" },
  { key: "virtualMic", labelKey: "audio.outVirtual", blurbKey: "audio.outVirtualBlurb" },
] as const;

export function AudioPage() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const playing = useApp((s) => s.playing);

  const buses = [
    { key: "music", labelKey: "audio.musicBus", v: settings.musicVolume, accent: "#9b6cff" },
    { key: "sfx", labelKey: "audio.sfxBus", v: settings.sfxVolume, accent: "#ff8b5c" },
    { key: "voice", labelKey: "audio.voiceBus", v: settings.voiceVolume, accent: "#2ce08a" },
  ] as const;

  const setOutput = (k: OutputTarget) => saveSettings({ outputTarget: k });

  return (
    <div>
      <PageHeader>
        <div>
          <Title>{t("audio.title")}</Title>
          <Subtitle>{t("audio.subtitle")}</Subtitle>
        </div>
      </PageHeader>

      {/* Mixer diagram */}
      <Card style={{ margin: "0 20px" }}>
        <MixerTitle>
          <Disc3 size={15} />
          <span>{t("audio.mixerNode")}</span>
          <Pill tone="dim" style={{ marginLeft: "auto" }}>{playing ? "● " + t("common.playing") : "○ " + t("common.idle")}</Pill>
        </MixerTitle>
        <MixerFlow>
          <BusCol>
            {buses.map((b) => (
              <BusRow key={b.key}>
                <BusTrack $accent={b.accent}>
                  <div className="fill" style={{ width: `${Math.round(b.v * 100)}%` }} />
                </BusTrack>
                <span>{t(b.labelKey)}</span>
                <b>{Math.round(b.v * 100)}%</b>
              </BusRow>
            ))}
          </BusCol>
          <FlowArrow>→</FlowArrow>
          <MixerNode>
            <Volume2 size={16} />
            <b>{t("audio.mixerNode")}</b>
            <span>
              {t("audio.master", { n: Math.round(settings.masterVolume * 100) })}
              {settings.ducking ? t("audio.duckOn") : ""}
            </span>
          </MixerNode>
          <FlowArrow>→</FlowArrow>
          <OutNode>
            <Headphones size={16} />
            <b>{t("audio.outputNode")}</b>
            <span>
              {effectiveOutputSinks(settings.outputTarget, settings.virtualMicInstalled).join(" + ") ||
                t(OUTPUT_OPTIONS.find((o) => o.key === settings.outputTarget)?.labelKey ?? "")}
            </span>
          </OutNode>
        </MixerFlow>
        <Muted style={{ fontSize: 12, display: "block", marginTop: 10 }}>
          {t("audio.mixerHelp")}
        </Muted>
      </Card>

      {/* Output target */}
      <SectionTitle>{t("audio.outputTitle")}</SectionTitle>
      <Grid cols={3}>
        {OUTPUT_OPTIONS.map((o) => {
          const active = settings.outputTarget === o.key;
          const needsMic = outputNeedsVirtualMic(o.key as OutputTarget);
          const pending = needsMic && !settings.virtualMicInstalled;
          return (
            <OutCard key={o.key} $active={active} as="button" onClick={() => setOutput(o.key)}>
              <Pill tone={active ? "ok" : "dim"}>{active ? t("audio.selected") : t("audio.option")}</Pill>
              {pending && <Pill tone="bad" data-testid={`pending-${o.key}`}>{t("audio.pendingDriver")}</Pill>}
              <b>{t(o.labelKey)}</b>
              <span>{t(o.blurbKey)}</span>
              {pending && (
                <Muted style={{ fontSize: 11 }}>
                  {t("audio.pendingBlurb")}
                </Muted>
              )}
            </OutCard>
          );
        })}
      </Grid>

      {/* Per-rule routing intent */}
      <SectionTitle>{t("audio.routingTitle")}</SectionTitle>
      <Grid cols={3}>
        {ROUTE_PREVIEW.map((r) => (
          <Card key={r.route}>
            <RouteHead>
              <Route size={14} />
              <b>{t(r.labelKey)}</b>
              <span>{routeToSinks(r.route).join(" + ")}</span>
            </RouteHead>
            <Muted style={{ fontSize: 12, lineHeight: 1.5 }}>{t(r.blurbKey)}</Muted>
          </Card>
        ))}
      </Grid>

      <SectionTitle>{t("audio.virtualMicTitle")}</SectionTitle>
      <VirtualMicSetup />
    </div>
  );
}

const SectionTitle = styled.h3`
  margin: 22px 22px 12px;
  font-size: 13px; letter-spacing: .06em; text-transform: uppercase;
  color: ${({ theme }) => theme.textDim};
`;

const MixerTitle = styled.div`
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
  color: ${({ theme }) => theme.textSoft}; font-size: 12px; font-weight: 600;
`;

const MixerFlow = styled.div`
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
`;

const BusCol = styled.div`
  display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 220px;
`;

const BusRow = styled.div`
  display: flex; align-items: center; gap: 10px; font-size: 12px;
  span { width: 46px; color: ${({ theme }) => theme.textSoft}; }
  b { width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
`;

const BusTrack = styled.div<{ $accent: string }>`
  flex: 1; height: 8px; border-radius: 99px; background: ${({ theme }) => theme.bgElev2};
  overflow: hidden;
  .fill { height: 100%; background: ${({ $accent }) => $accent}; opacity: .9; border-radius: 99px; transition: width .25s ease; }
`;

const FlowArrow = styled.span`
  font-size: 20px; color: ${({ theme }) => theme.accent};
`;

const MixerNode = styled.div`
  display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center;
  min-width: 128px; padding: 12px 14px; border-radius: ${({ theme }) => theme.radiusSm};
  background: ${({ theme }) => theme.bgElev2}; border: 1px solid ${({ theme }) => theme.border};
  svg { color: ${({ theme }) => theme.accent}; }
  b { font-size: 12px; letter-spacing: .04em; }
  span { font-size: 10px; color: ${({ theme }) => theme.textDim}; text-align: center; }
`;

const OutNode = styled(MixerNode)`
  svg { color: ${({ theme }) => theme.success}; }
`;

const OutCard = styled(Card)<{ $active: boolean }>`
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start; text-align: left;
  border-color: ${({ theme, $active }) => ($active ? theme.accent : theme.border)};
  box-shadow: ${({ theme, $active }) => ($active ? theme.glow : "none")};
  cursor: pointer;
  b { font-size: 14px; }
  span { font-size: 12px; color: ${({ theme }) => theme.textDim}; line-height: 1.5; }
`;

const RouteHead = styled.div`
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  b { font-size: 13px; flex: 1; }
  span { font-size: 11px; color: ${({ theme }) => theme.accentWarm}; text-transform: uppercase; letter-spacing: .03em; }
`;