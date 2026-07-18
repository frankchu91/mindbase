// Back-compat shim. The new source of truth is `./shell-state.ts`.
// This file is kept so older imports (e.g. LeftPanel) don't break during
// the migration; after the assembly task removes those callsites this
// file can be deleted.
import { useShellState } from './shell-state';

export function useTheme() {
  const theme = useShellState((s) => s.theme);
  const toggle = useShellState((s) => s.toggleTheme);
  return { theme, toggle };
}
