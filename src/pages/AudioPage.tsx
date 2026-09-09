import styled from "styled-components";
import { Headphones, Disc3, Volume2, Route, Info } from "lucide-react";
import { useApp } from "../state/useApp";
import { PageHeader, Title, Subtitle, Card, Grid, Pill, Muted } from "../components/ui";
import { routeToSinks } from "@core/audio/AudioRouter";
import type { AudioRoute } from "@core/events/GameEvent";

/** Per-route delivery summary, straight from the core audio router. */
const ROUTE_PREVIEW: { route: AudioRoute; label: string; blurb: string }[] = [
  { route: "SELF_ONLY", label: "SELF ONLY", blurb: "Only you hear it — sent to your speaker output." },
  { route: "TEAMMATES", label: "TEAMMATES", blurb: "Sent to the voice-chat input (virtual mic); not audible to you by design." },
  { route: "BOTH", label: "BOTH", blurb: "Heard by you AND routed to the voice-chat input." },
];

const OUTPUT_OPTIONS = [
  { key: "speaker", label: "Headphones / Speakers", blurb: "Straight to your own output device." },
  { key: "both", label: "Both", blurb: "Your output + the virtual microphone (teammates hear it)." },
  { key: "virtualMic", label: "Virtual Microphone", blurb: "Delivered to the virtual mic device so your team hears it. Needs a separate, opt-in driver." },
] as const;

export function AudioPage() {
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const playing = useApp((s) => s.playing);

  const buses = [
    { key: "Music", v: settings.musicVolume, accent: "#9b6cff" },
    { key: "SFX", v: settings.sfxVolume, accent: "#ff8b5c" },
    { key: "Voice", v: settings.voiceVolume, accent: "#2ce08a" },
  ] as const;

  const setOutput = (k: (typeof OUTPUT_OPTIONS)[number]["key"]) => saveSettings({ outputTarget: k });

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Audio</Title>
          <Subtitle>The mixer that turns game events into your soundtrack — and decides who hears it.</Subtitle>
        </div>
      </PageHeader>

      {/* Mixer diagram */}
      <Card style={{ margin: "0 20px" }}>
        <MixerTitle>
          <Disc3 size={15} />
          <span>MIXER</span>
          <Pill tone="dim" style={{ marginLeft: "auto" }}>{playing ? "● playing" : "○ idle"}</Pill>
        </MixerTitle>
        <MixerFlow>
          <BusCol>
            {buses.map((b) => (
              <BusRow key={b.key}>
                <BusTrack $accent={b.accent}>
                  <div className="fill" style={{ width: `${Math.round(b.v * 100)}%` }} />
                </BusTrack>
                <span>{b.key}</span>
                <b>{Math.round(b.v * 100)}%</b>
              </BusRow>
            ))}
          </BusCol>
          <FlowArrow>→</FlowArrow>
          <MixerNode>
            <Volume2 size={16} />
            <b>MIXER</b>
            <span>{Math.round(settings.masterVolume * 100)}% master{settings.ducking ? " · duck: ON" : ""}</span>
          </MixerNode>
          <FlowArrow>→</FlowArrow>
          <OutNode>
            <Headphones size={16} />
            <b>OUTPUT</b>
            <span>{OUTPUT_OPTIONS.find((o) => o.key === settings.outputTarget)?.label}</span>
          </OutNode>
        </MixerFlow>
        <Muted style={{ fontSize: 12, display: "block", marginTop: 10 }}>
          Microphone input joins the mix here. When you speak and Ducking is on, the music/SFX buses dip to the duck level automatically; they restore when you stop.
        </Muted>
      </Card>

      {/* Output target */}
      <SectionTitle>Output</SectionTitle>
      <Grid cols={3}>
        {OUTPUT_OPTIONS.map((o) => {
          const active = settings.outputTarget === o.key;
          return (
            <OutCard key={o.key} $active={active} as="button" onClick={() => setOutput(o.key)}>
              <Pill tone={active ? "ok" : "dim"}>{active ? "SELECTED" : "OPTION"}</Pill>
              <b>{o.label}</b>
              <span>{o.blurb}</span>
            </OutCard>
          );
        })}
      </Grid>

      {/* Per-rule routing intent */}
      <SectionTitle>Routing — how reactions are delivered</SectionTitle>
      <Grid cols={3}>
        {ROUTE_PREVIEW.map((r) => (
          <Card key={r.route}>
            <RouteHead>
              <Route size={14} />
              <b>{r.label}</b>
              <span>{routeToSinks(r.route).join(" + ")}</span>
            </RouteHead>
            <Muted style={{ fontSize: 12, lineHeight: 1.5 }}>{r.blurb}</Muted>
          </Card>
        ))}
      </Grid>

      <Card style={{ margin: "0 20px" }}>
        <H>
          <Info size={14} /> About the Virtual Microphone
        </H>
        <Ul>
          <li>Virtual mic is a <b>separate, opt-in driver component</b> — selecting it here doesn't install anything.</li>
          <li>It never bypasses game voice, permissions, or anti-cheat; it is a plain Windows audio device.</li>
          <li>Until a virtual mic is present, output safely falls back to your speakers/headphones.</li>
        </Ul>
      </Card>
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

const H = styled.h4`
  display: flex; align-items: center; gap: 8px; font-size: 14px; margin-bottom: 12px;
  color: ${({ theme }) => theme.textSoft};
`;

const Ul = styled.ul`
  list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: ${({ theme }) => theme.textSoft};
  li::before { content: "•  "; color: ${({ theme }) => theme.accent}; }
`;