import { useState } from "react";
import styled from "styled-components";
import { Mic, ShieldAlert, Check, ChevronDown } from "lucide-react";
import { useApp } from "../state/useApp";
import { Card, Button, Pill } from "./ui";
import { useT } from "../i18n";

/**
 * Explicit install + consent step for the virtual microphone (§8, roadmap).
 *
 * The virtual mic is a *separate, opt-in* Windows loopback driver. Game Music Box
 * never installs it silently and never bypasses game voice, permissions or
 * anti-cheat. Until the user installs the driver and confirms it here, selecting
 * a virtual-mic output only takes effect as an honest fallback to speakers.
 */
export function VirtualMicSetup() {
  const t = useT();
  const installed = useApp((s) => s.settings.virtualMicInstalled);
  const saveSettings = useApp((s) => s.saveSettings);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);

  return (
    <Card style={{ margin: "0 20px" }}>
      <Head>
        <Mic size={15} />
        <b>{t("vm.title")}</b>
        <Pill tone={installed ? "ok" : "bad"} data-testid="vm-status">
          {installed ? "● " + t("vm.installed") : "○ " + t("vm.notInstalled")}
        </Pill>
        <ToggleBtn as="button" onClick={() => setOpen((o) => !o)} data-testid="vm-toggle">
          <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </ToggleBtn>
      </Head>

      {installed ? (
        <p data-testid="vm-enabled-note">
          {t("vm.installedBlurb", { b: "" })}
        </p>
      ) : open ? (
        <Body>
          <ol>
            <li>{t("vm.step1", { b: "" })}</li>
            <li>{t("vm.step2", { b: "" })}</li>
            <li>{t("vm.step3")}</li>
          </ol>

          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              data-testid="vm-consent"
            />
            <span>{t("vm.consent")}</span>
          </label>

          <Actions>
            <Button
              variant="primary"
              disabled={!consent}
              onClick={() => saveSettings({ virtualMicInstalled: true })}
              data-testid="vm-confirm"
            >
              <Check size={15} /> {t("vm.confirm")}
            </Button>
          </Actions>

          <Fallback>
            <ShieldAlert size={13} />
            {t("vm.fallback")}
          </Fallback>
        </Body>
      ) : (
        <p data-testid="vm-cta-note">
          {t("vm.notInstalledHint", { b: "" })}
        </p>
      )}
    </Card>
  );
}

const Head = styled.div`
  display: flex; align-items: center; gap: 8px; color: ${({ theme }) => theme.textSoft};
  font-size: 13px; font-weight: 600;
  svg { color: ${({ theme }) => theme.accent}; }
`;

const ToggleBtn = styled(Card)`
  margin-left: auto; padding: 4px 8px; cursor: pointer; display: inline-flex;
  background: transparent; border-color: ${({ theme }) => theme.border};
  &:hover { border-color: ${({ theme }) => theme.accent}; }
`;

const Body = styled.div`
  margin-top: 14px; display: flex; flex-direction: column; gap: 14px;
  font-size: 13px; color: ${({ theme }) => theme.textSoft}; line-height: 1.6;
  ol { list-style: decimal; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; }
  label {
    display: flex; gap: 10px; align-items: flex-start;
    input { margin-top: 3px; accent-color: ${({ theme }) => theme.accent}; }
  }
`;

const Actions = styled.div`
  display: flex; justify-content: flex-end;
`;

const Fallback = styled.p`
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; color: ${({ theme }) => theme.danger};
  svg { flex-shrink: 0; }
`;