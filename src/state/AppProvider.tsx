import React, { useEffect, useRef } from "react";
import { GameController } from "../domain/GameController";
import { useApp } from "./useApp";
import { navigateTo } from "../navBus";
import { bridge } from "../bridge";
import { effectiveOutputSinks } from "@core/audio/AudioRouter";

/**
 * Boots the app once: loads persisted state and wires the GameController
 * (GSI adapter → event engine → rule engine → audio) into the UI store.
 */
export const controllerRef: { current: GameController | null } = {
  current: null,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const init = useApp((s) => s.init);
  const pushLog = useApp((s) => s.pushLog);
  const onPlaying = useApp((s) => s.onPlaying);
  const onSession = useApp((s) => s.onSession);
  const onConnection = useApp((s) => s.onConnection);
  const onLcuConnection = useApp((s) => s.onLcuConnection);
  const pushNotice = useApp((s) => s.pushNotice);
  const setPaused = useApp((s) => s.setPaused);
  const paused = useApp((s) => s.paused);

  // Keep the controller's paused flag in sync with the store (tray/shortcut/UI).
  useEffect(() => {
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  // Reflect the Settings/Audio mix destination into the play pipeline so a
  // "both / virtual mic" selection actually feeds the CABLE virtual mic.
  const outputTarget = useApp((s) => s.settings.outputTarget);
  const virtualMicInstalled = useApp((s) => s.settings.virtualMicInstalled);
  useEffect(() => {
    controllerRef.current?.setRenderSinks(
      effectiveOutputSinks(outputTarget, virtualMicInstalled),
    );
  }, [outputTarget, virtualMicInstalled]);

  // Commands initiated from the OS layer (system tray, global hotkeys).
  useEffect(() => {
    return bridge.onCommand((cmd) => {
      if (cmd.kind === "toggle-reaction") {
        void setPaused(!useApp.getState().paused);
      } else if (cmd.kind === "navigate") {
        navigateTo(cmd.to ?? "/");
      }
    });
  }, [setPaused]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      await init();
      if (disposed) return;
      const controller = new GameController({
        onLog: (e) => pushLog(e),
        onSession: (s) => onSession(s),
        onConnection: (c) => onConnection(c),
        onLcuRunning: (r) => onLcuConnection(r),
        onPlaying: (info) => onPlaying(info ? { title: info.title } : null),
        onNotice: (n) => pushNotice(n),
        onAssetPlayed: (p) => void useApp.getState().updateAsset(p.assetId, { lastPlayedAt: p.lastPlayedAt, playCount: p.playCount }),
      });
      controllerRef.current = controller;
      await controller.init();
      // The sink-sync effect (dep: outputTarget/virtualMicInstalled) can run
      // before the async-created controller exists, leaving it on the default
      // ["SPEAKER"]. Re-apply from persisted settings so "both" actually routes
      // to the virtual mic even with a stale first pass.
      const s = useApp.getState().settings;
      controllerRef.current?.setRenderSinks(
        effectiveOutputSinks(s.outputTarget, s.virtualMicInstalled),
      );
    })();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}