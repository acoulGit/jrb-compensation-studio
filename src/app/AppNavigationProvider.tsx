/** Navigation applicative avec état transitoire (Lot 2B-4B). */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PageId } from "../components/navigation/navigation";

export interface SimulationHistoryNavigationState {
  campaignId?: number;
  runId?: number;
}

export interface AppNavigationState {
  simulationHistory?: SimulationHistoryNavigationState;
}

interface AppNavigationContextValue {
  activePage: PageId;
  navigateTo: (page: PageId, state?: AppNavigationState) => void;
  navigationState: AppNavigationState | null;
  clearNavigationState: () => void;
}

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null,
);

export function AppNavigationProvider({
  children,
  activePage,
  onActivePageChange,
}: {
  children: ReactNode;
  activePage: PageId;
  onActivePageChange: (page: PageId) => void;
}) {
  const [navigationState, setNavigationState] =
    useState<AppNavigationState | null>(null);

  const navigateTo = useCallback(
    (page: PageId, state?: AppNavigationState) => {
      setNavigationState(state ?? null);
      onActivePageChange(page);
    },
    [onActivePageChange],
  );

  const clearNavigationState = useCallback(() => {
    setNavigationState(null);
  }, []);

  const value = useMemo(
    () => ({
      activePage,
      navigateTo,
      navigationState,
      clearNavigationState,
    }),
    [activePage, navigateTo, navigationState, clearNavigationState],
  );

  return (
    <AppNavigationContext.Provider value={value}>
      {children}
    </AppNavigationContext.Provider>
  );
}

export function useAppNavigation(): AppNavigationContextValue {
  const context = useContext(AppNavigationContext);
  if (!context) {
    throw new Error(
      "useAppNavigation doit être utilisé dans AppNavigationProvider.",
    );
  }
  return context;
}
