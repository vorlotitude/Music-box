import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Music2, Gamepad2, FolderOpen, Package, Check, Sparkles } from "lucide-react";
import { useApp } from "../state/useApp";
import { useT } from "../i18n";
import { bridge } from "../bridge";
import { v4 as uuid } from "uuid";
import type { MusicBox } from "@core/rules/Rule";

const TOTAL = 5;

/** First-run onboarding. Lean wizard that gets a new user live in ~1 minute. */
export function OnboardingPage() {
  const t = useT();
  const navigate = useNavigate();
  const assets = useApp((s) => s.assets);
  const saveBox = useApp((s) => s.saveBox);
  const importFiles = useApp((s) => s.importFiles);
  const saveSettings = useApp((s) => s.saveSettings);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const importAudio = async () => {
    setBusy(true);
    try {
      const files = await bridge.openAudioFiles();
      if (files.length) await importFiles(files);
    } finally {
      setBusy(false);
    }
  };

  const createBox = () => saveBox({
    id: uuid(), name: t("onb.boxName"), description: "",
    game: "cs2", rules: [], volume: 0.8, enabled: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  } as MusicBox);

  const finish = async () => {
    await saveSettings({ onboarded: true });
    navigate("/");
  };

  return (
    <Wrap>
      <Card>
        <Progress>
          {[1, 2, 3, 4, 5].map((n) => (
            <Bar key={n} $on={n <= step} />
          ))}
        </Progress>

        <StepLabel>{t("onb.step", { cur: step, total: TOTAL })}</StepLabel>

        {step === 1 && (
          <Pane>
            <Logo><Music2 size={30} /></Logo>
            <H1>{t("onb.title")}</H1>
            <P>{t("onb.sub")}</P>
            <Btns><Primary onClick={() => setStep(2)}>{t("onb.getStarted")}</Primary></Btns>
          </Pane>
        )}

        {step === 2 && (
          <Pane>
            <H2><Sparkles size={18} /> {t("onb.chooseGameTitle")}</H2>
            <P>{t("onb.chooseGameSub")}</P>
            <GameCard>
              <GameIcon><Gamepad2 size={20} /></GameIcon>
              <div>
                <b>{t("onb.cs2")}</b>
                <span>{t("onb.cs2Desc")}</span>
              </div>
              <CheckBox $on><Check size={15} /></CheckBox>
            </GameCard>
            <Btns>
              <Ghost onClick={() => setStep(1)}>{t("onb.back")}</Ghost>
              <Primary onClick={() => setStep(3)}>{t("onb.next")}</Primary>
            </Btns>
          </Pane>
        )}

        {step === 3 && (
          <Pane>
            <H2><FolderOpen size={18} /> {t("onb.importTitle")}</H2>
            <P>{t("onb.importSub")}</P>
            {assets.length > 0 && (
              <CountPill>{t("onb.importCount", { n: assets.length })}</CountPill>
            )}
            <Btns>
              <Ghost onClick={() => setStep(2)}>{t("onb.back")}</Ghost>
              <Primary onClick={importAudio} disabled={busy}>{t("onb.importBtn")}</Primary>
              <Ghost onClick={() => setStep(4)}>{t("onb.skip")}</Ghost>
            </Btns>
          </Pane>
        )}

        {step === 4 && (
          <Pane>
            <H2><Package size={18} /> {t("onb.boxTitle")}</H2>
            <P>{t("onb.boxSub")}</P>
            <Btns>
              <Ghost onClick={() => setStep(3)}>{t("onb.back")}</Ghost>
              <Primary onClick={createBox}>{t("onb.boxCreate")}</Primary>
              <Ghost onClick={() => setStep(5)}>{t("onb.skip")}</Ghost>
            </Btns>
          </Pane>
        )}

        {step === 5 && (
          <Pane>
            <DoneIcon><Check size={26} /></DoneIcon>
            <H1>{t("onb.doneTitle")}</H1>
            <P>{t("onb.doneSub")}</P>
            <Summary>{t("onb.summary", {
              game: t("onb.cs2"), n: assets.length,
              box: t("onb.boxName"),
            })}</Summary>
            <SummaryHint>{t("onb.emptySummary")}</SummaryHint>
            <Btns>
              <Primary onClick={finish} disabled={busy}>{t("onb.startUsing")}</Primary>
            </Btns>
          </Pane>
        )}
      </Card>
    </Wrap>
  );
}
const Wrap = styled.div`
  height: 100vh; display: grid; place-items: center;
  background: radial-gradient(1200px 600px at 50% -10%, ${({ theme }) => theme.bgElev2}, ${({ theme }) => theme.bg});
`;
const Card = styled.div`
  width: min(560px, 92vw); padding: 40px 44px 36px; border-radius: 20px;
  background: ${({ theme }) => theme.bgElev}; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: 0 24px 60px rgba(0,0,0,.45);
`;
const Progress = styled.div`display: flex; gap: 8px; margin-bottom: 26px;`;
const Bar = styled.div<{ $on: boolean }>`
  height: 5px; flex: 1; border-radius: 99px; background: ${({ theme, $on }) => ($on ? theme.accent : theme.bgElev2)};
  transition: background .2s;
`;
const StepLabel = styled.div`font-size: 11px; letter-spacing: .12em; font-weight: 700; color: ${({ theme }) => theme.textDim}; margin-bottom: 18px;`;
const Pane = styled.div`display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px;`;
const Logo = styled.div`
  width: 68px; height: 68px; border-radius: 18px; display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, ${({ theme }) => theme.accent}, ${({ theme }) => theme.accent2});
  box-shadow: ${({ theme }) => theme.glow}; margin-bottom: 6px;
`;
const H2 = styled.h2`display: flex; align-items: center; gap: 8px; margin: 0; font-size: 20px;`;
const H1 = styled.h1`margin: 6px 0 0; font-size: 28px; font-family: ${({ theme }) => theme.fontDisplay}; letter-spacing: .01em;`;
const P = styled.p`margin: 0; color: ${({ theme }) => theme.textSoft}; font-size: 14px; line-height: 1.6; max-width: 420px;`;
const Btns = styled.div`display: flex; gap: 12px; margin-top: 22px; flex-wrap: wrap; justify-content: center;`;
const Primary = styled.button`
  background: ${({ theme }) => theme.accent}; color: #fff; border: none; border-radius: 12px;
  padding: 14px 26px; font-size: 14px; font-weight: 600; cursor: pointer; transition: filter .15s;
  &:hover:not(:disabled) { filter: brightness(1.1); }
  &:disabled { opacity: .6; cursor: default; }
`;
const Ghost = styled.button`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.textSoft};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: 12px; padding: 14px 22px;
  font-size: 14px; font-weight: 600; cursor: pointer;
  &:hover { color: ${({ theme }) => theme.text}; }
`;
const GameCard = styled.div`
  display: flex; align-items: center; gap: 14px; width: 100%; max-width: 420px;
  padding: 16px 18px; border-radius: 14px; border: 1px solid ${({ theme }) => theme.accent};
  background: ${({ theme }) => theme.bgElev2}; text-align: left; margin-top: 10px;
`;
const GameIcon = styled.div`width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: ${({ theme }) => theme.bgElev}; color: ${({ theme }) => theme.accent};`;
const CheckBox = styled.div<{ $on: boolean }>`
  width: 24px; height: 24px; border-radius: 8px; margin-left: auto; display: grid; place-items: center;
  background: ${({ theme }) => theme.accent}; color: #fff;
`;
const CountPill = styled.div`
  padding: 8px 16px; border-radius: 99px; background: ${({ theme }) => theme.bgElev2};
  border: 1px solid ${({ theme }) => theme.border}; font-size: 13px; font-weight: 600; color: ${({ theme }) => theme.success};
`;
const DoneIcon = styled.div`
  width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, ${({ theme }) => theme.success}, ${({ theme }) => theme.accent2});
  box-shadow: ${({ theme }) => theme.glow}; margin-bottom: 4px;
`;
const Summary = styled.div`margin-top: 8px; padding: 12px 18px; border-radius: 12px; background: ${({ theme }) => theme.bgElev2}; font-size: 13px; font-weight: 600;`;
const SummaryHint = styled.div`font-size: 12px; color: ${({ theme }) => theme.textDim};`;