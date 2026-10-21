import styled from "styled-components";
import { useEffect } from "react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Card, Muted } from "../components/ui";
import { useT, LANGUAGES } from "../i18n";

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const t = useT();

  const set = (patch: Partial<typeof settings>) => saveSettings(patch);

  // Apply ducking to the live audio engine whenever the setting changes.
  useEffect(() => {
    controllerRef.current?.setDucking(settings.ducking, settings.duckLevel, settings.duckThreshold);
  }, [settings.ducking, settings.duckLevel, settings.duckThreshold]);

  // Apply bus volumes live so the sliders take effect without a manual click.
  useEffect(() => {
    controllerRef.current?.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
      voice: settings.voiceVolume,
    });
  }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume, settings.voiceVolume]);

  return (
    <div>
      <PageHeader>
        <div>
          <Title>{t("settings.title")}</Title>
          <Subtitle>{t("settings.subtitle")}</Subtitle>
        </div>
      </PageHeader>

      <Row>
        {/* Language / General */}
        <Card style={{ flex: 1 }}>
          <H>{t("settings.general")}</H>
          <Field label={t("settings.language")} hint={t("settings.languageHint")}>
            <Select value={settings.language} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ language: e.target.value })}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("settings.minimizeToTray")} hint={t("settings.minimizeHint")}>
            <Toggle checked={settings.minimizeToTray} onChange={(v) => set({ minimizeToTray: v })} />
          </Field>
        </Card>

        {/* Startup */}
        <Card style={{ flex: 1 }}>
          <H>{t("settings.startup")}</H>
          <Field label={t("settings.startWithWindows")}>
            <Toggle checked={settings.startWithWindows} onChange={(v) => set({ startWithWindows: v })} />
          </Field>
          <Field label={t("settings.launchMinimized")}>
            <Toggle checked={settings.launchMinimized} onChange={(v) => set({ launchMinimized: v })} />
          </Field>
          <Field label={t("settings.startMonitor")} hint={t("settings.startMonitorHint")}>
            <Toggle checked={settings.startMonitoringGames} onChange={(v) => set({ startMonitoringGames: v })} />
          </Field>
        </Card>
      </Row>

      <Row>
        {/* Keyboard & global shortcuts */}
        <Card style={{ flex: 1 }}>
          <H>{t("settings.keyboard")}</H>
          <Field label={t("settings.shortcuts")} hint={t("settings.keyboardHint")}>
            <Toggle checked={settings.shortcutsEnabled} onChange={(v) => set({ shortcutsEnabled: v })} />
          </Field>
          <KbdList>
            <li><code>Ctrl + Shift + M</code><span>{t("settings.shortcutOpen")}</span></li>
            <li><code>Ctrl + Shift + P</code><span>{t("settings.shortcutPause")}</span></li>
          </KbdList>
        </Card>

        {/* Audio */}
        <Card style={{ flex: 1 }}>
          <H>{t("settings.audio")}</H>
          <Field label={t("settings.masterVolume")} hint={t("settings.masterHint")}>
            <Range value={Math.round(settings.masterVolume * 100)} onChange={(v) => set({ masterVolume: v / 100 })} />
          </Field>
          <Field label={t("settings.musicVolume")} hint={t("settings.musicHint")}>
            <Range value={Math.round(settings.musicVolume * 100)} onChange={(v) => set({ musicVolume: v / 100 })} />
          </Field>
          <Field label={t("settings.sfxVolume")}>
            <Range value={Math.round(settings.sfxVolume * 100)} onChange={(v) => set({ sfxVolume: v / 100 })} />
          </Field>
          <Field label={t("settings.voiceVolume")}>
            <Range value={Math.round(settings.voiceVolume * 100)} onChange={(v) => set({ voiceVolume: v / 100 })} />
          </Field>
          <Field label={t("settings.ducking")} hint={t("settings.duckingHint")} toggle>
            <Toggle checked={settings.ducking} onChange={(v) => set({ ducking: v })} />
          </Field>
          {settings.ducking && (
            <>
              <Field label={t("settings.duckLevel")} hint={t("settings.duckLevelHint")}>
                <Range value={Math.round((1 - settings.duckLevel) * 100)} onChange={(v) => set({ duckLevel: 1 - v / 100 })} />
              </Field>
              <Field label={t("settings.duckThreshold")} hint={t("settings.duckThresholdHint")}>
                <Range value={Math.round(settings.duckThreshold * 100)} onChange={(v) => set({ duckThreshold: v / 100 })} />
              </Field>
            </>
          )}
          <ApplyBtnRow>
            <MiniBtn onClick={() => controllerRef.current?.setVolumes({ master: settings.masterVolume, music: settings.musicVolume, sfx: settings.sfxVolume, voice: settings.voiceVolume })}>
              {t("settings.applyVolumes")}
            </MiniBtn>
          </ApplyBtnRow>
        </Card>

        {/* Game */}
        <Card style={{ flex: 1 }}>
          <H>{t("settings.game")}</H>
          <Field label={t("settings.autoDetect")} hint={t("settings.autoDetectHint")}>
            <Toggle checked={settings.autoDetect} onChange={(v) => set({ autoDetect: v })} />
          </Field>
          <Field label={t("settings.gsiPort")} hint={t("settings.gsiPortHint")}>
            <Num value={settings.gsiPort} onChange={(v) => set({ gsiPort: Number(v) })} />
          </Field>
          <Field label={t("settings.devMode")} hint={t("settings.devModeHint")}>
            <Toggle checked={settings.developerMode} onChange={(v) => set({ developerMode: v })} />
          </Field>
        </Card>
      </Row>

      <Row>
        {/* Output routing */}
        <Card style={{ flex: 1 }}>
          <H>{t("settings.output")}</H>
          <Muted style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            {t("settings.outputBlurb")}
          </Muted>
          <PillNote>{t("settings.outputPill")}</PillNote>
        </Card>
      </Row>

      <Card style={{ marginBottom: 10 }}>
        <H>{t("settings.privacy")}</H>
        <Ul>
          <li>{t("settings.p1")}</li>
          <li>{t("settings.p2")}</li>
          <li>{t("settings.p3")}</li>
          <li>{t("settings.p4")}</li>
          <li>{t("settings.p5")}</li>
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
function Select({ value, onChange, children }: any) {
  return (
    <StyledSelect value={value} onChange={onChange}>
      {children}
    </StyledSelect>
  );
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
const StyledSelect = styled.select`
  min-width: 120px; background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; padding: 7px 10px; font-size: 13px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.accent}; }
`;
const ApplyBtnRow = styled.div`margin-top: 12px; display: flex; justify-content: flex-end;`;
const MiniBtn = styled.button`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.textSoft};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: 9px; padding: 8px 14px; font-size: 12px;
  &:hover { color: ${({ theme }) => theme.text}; }
`;
const PillNote = styled(Muted)`font-size: 12px; display: block;`;
const KbdList = styled.ul`
  list-style: none; display: flex; flex-direction: column; gap: 8px; margin-top: 10px;
  li {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-size: 12px; color: ${({ theme }) => theme.textSoft};
  }
  code {
    background: ${({ theme }) => theme.bgElev2}; border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px; padding: 3px 8px; font-size: 11px; color: ${({ theme }) => theme.accent};
  }
`;
const Ul = styled.ul`
  list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: ${({ theme }) => theme.textSoft};
  li::before { content: "•  "; color: ${({ theme }) => theme.accent}; }
`;