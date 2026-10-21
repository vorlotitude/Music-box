import styled from "styled-components";
import { Play, Square, Volume2, Pause } from "lucide-react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { useT } from "../i18n";

export function BottomPlayer() {
  const t = useT();
  const playing = useApp((s) => s.playing);
  const paused = useApp((s) => s.paused);
  const setPaused = useApp((s) => s.setPaused);
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);

  const master = settings.masterVolume * 100;

  return (
    <Bar>
      <NowPlaying>
        {playing ? (
          <>
            <Art>{playing.title.charAt(0).toUpperCase()}</Art>
            <div>
              <b className="nowrap">{playing.title}</b>
              <span className="nowrap">{t("player.nowPlaying")}</span>
            </div>
          </>
        ) : (
          <>
            <Art dim>{paused ? "⏸" : "♪"}</Art>
            <div>
              <b>{paused ? t("status.paused") : t("player.idle")}</b>
              <span>{t("player.waiting")}</span>
            </div>
          </>
        )}
      </NowPlaying>

      <Transport>
        {paused ? (
          <Action onClick={() => void setPaused(false)} title={t("player.resume")}>
            <Play size={16} />
          </Action>
        ) : (
          <Action onClick={() => void setPaused(true)} title={t("player.pauseReaction")}>
            <Pause size={16} />
          </Action>
        )}
        <StopAction
          onClick={() => controllerRef.current?.stopAll()}
          title={t("player.stop")}
          disabled={!playing}
        >
          <Square size={14} />
        </StopAction>
      </Transport>

      <Volume>
        <Volume2 size={16} />
        <input
          type="range"
          min={0}
          max={100}
          value={master}
          onChange={(e) => saveSettings({ masterVolume: Number(e.target.value) / 100 })}
        />
        <span>{Math.round(master)}%</span>
      </Volume>
    </Bar>
  );
}

const Bar = styled.footer`
  grid-area: player;
  height: 74px;
  background: ${({ theme }) => theme.bgElev};
  border-top: 1px solid ${({ theme }) => theme.border};
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 28px;
  gap: 24px;
`;

const NowPlaying = styled.div`
  display: flex; align-items: center; gap: 12px; min-width: 0;
  div { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
  b { font-size: 13px; }
  span { font-size: 11px; color: ${({ theme }) => theme.textDim}; }
`;

const Art = styled.div<{ dim?: boolean }>`
  width: 46px; height: 46px; border-radius: 10px;
  background: ${(p) => (p.dim ? "none" : `linear-gradient(135deg, ${p.theme.accent}, ${p.theme.accent2})`)};
  border: ${(p) => (p.dim ? `1px dashed ${p.theme.border}` : "none")};
  display: grid; place-items: center; font-weight: 800; color: #fff;
`;

const Transport = styled.div`
  display: flex; align-items: center; gap: 12px;
`;

const Action = styled.button`
  width: 46px; height: 46px; border-radius: 50%;
  background: ${({ theme }) => theme.text}; color: #000; border: none;
  display: grid; place-items: center;
  &:disabled { opacity: .3; cursor: default; }
`;

const StopAction = styled.button`
  width: 40px; height: 40px; border-radius: 50%;
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.textSoft}; border: none;
  display: grid; place-items: center;
  &:disabled { opacity: .3; cursor: default; }
  &:not(:disabled):hover { color: ${({ theme }) => theme.text}; }
`;

const Volume = styled.div`
  display: flex; align-items: center; gap: 10px; justify-self: end;
  color: ${({ theme }) => theme.textSoft};
  span { font-size: 12px; color: ${({ theme }) => theme.textDim}; width: 40px; text-align: right; }
  input[type="range"] {
    width: 120px; accent-color: ${({ theme }) => theme.accent};
  }
`;