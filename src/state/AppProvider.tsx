import React, { useEffect, useRef } from "react";
import { GameController } from "../domain/GameController";
import { useApp } from "./useApp";

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

  useEffect(() => {
    let disposed = false;
    (async () => {
      await init();
      if (disposed) return;
      const controller = new GameController({
        onLog: (e) => pushLog(e),
        onSession: (s) => onSession(s),
        onConnection: (c) => onConnection(c),
        onPlaying: (info) => onPlaying(info ? { title: info.title } : null),
      });
      controllerRef.current = controller;
      await controller.init();
    })();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}