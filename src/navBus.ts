/**
 * Tiny navigation bridge so the Electron main process (tray menu / global
 * shortcuts) can ask the renderer's react-router to change route. App.tsx
 * registers the live `useNavigate` here once mounted.
 */
let navigator: ((route: string) => void) | null = null;

export function setNavigator(fn: ((route: string) => void) | null): void {
  navigator = fn;
}

export function navigateTo(route: string): void {
  navigator?.(route);
}