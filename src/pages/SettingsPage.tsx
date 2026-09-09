import styled from "styled-components";
import { useEffect } from "react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Card, Muted } from "../components/ui";

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);

  const set = (patch: Partial<typeof settings>) => saveSettings(patch);

  // Apply ducking to the live audio engine whenever the setting changes.
  useEffect(() => {
    controllerRef.current?.setDucking(settings.ducking, settings.duckLevel);
  }, [settings.ducking, settings.duckLevel]);

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Settings</Title>
          <Subtitle>Audio buses, game connectivity, output routing and privacy. Everything is local.</Subtitle>
        </div>
      </PageHeader>

      <Row>
        {/* Audio */}
        <Card style={{ flex: 1 }}>
          <H>Audio</H>
          <Field label="Master Volume" hint="Global output">
            <Range value={Math.round(settings.masterVolume * 100)} onChange={(v) => set({ masterVolume: v / 100 })} />
          </Field>
          <Field label="Music Volume" hint="Reactions routed to the music bus">
            <Range value={Math.round(settings.musicVolume * 100)} onChange={(v) => set({ musicVolume: v / 100 })} />
          </Field>
          <Field label="SFX Volume">
            <Range value={Math.round(settings.sfxVolume * 100)} onChange={(v) => set({ sfxVolume: v / 100 })} />
          </Field>
          <Field label="Voice Volume">
            <Range value={Math.round(settings.voiceVolume * 100)} onChange={(v) => set({ voiceVolume: v / 100 })} />
          </Field>
          <Field label="Ducking" hint="Lower music/SFX while you talk" toggle>
            <Toggle checked={settings.ducking} onChange={(v) => set({ ducking: v })} />
          </Field>
          {settings.ducking && (
            <Field label="Duck level" hint="How much music drops when speaking">
              <Range value={Math.round((1 - settings.duckLevel) * 100)} onChange={(v) => set({ duckLevel: 1 - v / 100 })} />
            </Field>
          )}
          <ApplyBtnRow>
            <MiniBtn onClick={() => controllerRef.current?.setVolumes({ master: settings.masterVolume, music: settings.musicVolume, sfx: settings.sfxVolume, voice: settings.voiceVolume })}>
              Apply volumes now
            </MiniBtn>
          </ApplyBtnRow>
        </Card>

        {/* Game */}
        <Card style={{ flex: 1 }}>
          <H>Game</H>
          <Field label="Auto-detect CS2 process" hint="Lightweight process-name check (non-invasive)">
            <Toggle checked={settings.autoDetect} onChange={(v) => set({ autoDetect: v })} />
          </Field>
          <Field label="GSI port" hint="Loopback listener CS2 posts to">
            <Num value={settings.gsiPort} onChange={(v) => set({ gsiPort: Number(v) })} />
          </Field>
          <Field label="Developer / debug mode" hint="Shows manual test triggers + event log">
            <Toggle checked={settings.developerMode} onChange={(v) => set({ developerMode: v })} />
          </Field>
        </Card>
      </Row>

      <Row>
        {/* General */}
        <Card style={{ flex: 1 }}>
          <H>General</H>
          <Field label="Start with Windows">
            <Toggle checked={settings.startWithWindows} onChange={(v) => set({ startWithWindows: v })} />
          </Field>
          <Field label="Minimize to tray" hint="Close hides the window instead of quitting">
            <Toggle checked={settings.minimizeToTray} onChange={(v) => set({ minimizeToTray: v })} />
          </Field>
          <Field label="Launch minimized">
            <Toggle checked={settings.launchMinimized} onChange={(v) => set({ launchMinimized: v })} />
          </Field>
        </Card>

        {/* Output routing */}
        <Card style={{ flex: 1 }}>
          <H>Output Routing</H>
          <Muted style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            Architecture is ready for SELF_ONLY / TEAMMATES / BOTH and a Virtual Microphone. The MVP outputs to your speakers/headphones; a virtual mic device is a separate, opt-in driver component.
          </Muted>
          <PillNote>Headphones / Speakers (active) · Virtual Microphone (planned)</PillNote>
        </Card>
      </Row>

      <Card style={{ marginBottom: 10 }}>
        <H>Privacy & Local-First</H>
        <Ul>
          <li>Your audio files are referenced by local path only. Nothing is uploaded, distributed, or wrapped into a pack.</li>
          <li>Game state data is parsed locally and never leaves your machine.</li>
          <li>The app does not auto-fetch music from any streaming/download service.</li>
          <li>No AI features are enabled now. Any future AI generation will ask your explicit consent before sending data.</li>
          <li>All data (audio references, rules, boxes, settings, history) is stored locally on your machine.</li>
        </Ul>
      </Card>
    </div>
  );
}

function Range({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}
function Num({ value, onChange }: { value: number; onChange: (v: string) => void }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
}
function Field({ label, hint, toggle, children }: any) {
  return (
    <FieldRow>
      <div>
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </FieldRow>
  );
}

const Row = styled.div`display: flex; gap: 16px; margin: 0 20px 16px; flex-wrap: wrap; align-items: stretch;`;
const H = styled.h3`font-size: 15px; margin-bottom: 14px; color: ${({ theme }) => theme.accentWarm};`;
const FieldRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px 0; border-bottom: 1px solid ${({ theme }) => theme.borderSoft};
  div { display: flex; flex-direction: column; gap: 2px; }
  b { font-size: 13px; }
  span { font-size: 11px; color: ${({ theme }) => theme.textDim}; }
  input[type="range"] { width: 140px; accent-color: ${({ theme }) => theme.accent}; }
  input[type="checkbox"] { width: 17px; height: 17px; accent-color: ${({ theme }) => theme.accent}; }
  input[type="number"] { width: 80px; background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text}; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; padding: 6px 8px; }
`;
const ApplyBtnRow = styled.div`margin-top: 12px; display: flex; justify-content: flex-end;`;
const MiniBtn = styled.button`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.textSoft};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: 9px; padding: 8px 14px; font-size: 12px;
  &:hover { color: ${({ theme }) => theme.text}; }
`;
const PillNote = styled(Muted)`font-size: 12px; display: block;`;
const Ul = styled.ul`
  list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: ${({ theme }) => theme.textSoft};
  li::before { content: "•  "; color: ${({ theme }) => theme.accent}; }
`;