import "styled-components";
import { theme } from "./theme";

type ThemeShape = typeof theme;

declare module "styled-components" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends ThemeShape {}
}