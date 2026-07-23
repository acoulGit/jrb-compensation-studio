/** Invalidation du cache d’historique après sauvegarde (Lot 2B-4B). */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SimulationHistoryRefreshContextValue {
  getRevision: (campaignId: number) => number;
  bumpRevision: (campaignId: number) => void;
}

const SimulationHistoryRefreshContext =
  createContext<SimulationHistoryRefreshContextValue | null>(null);

export function SimulationHistoryRefreshProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [revisionsByCampaignId, setRevisionsByCampaignId] = useState<
    Record<number, number>
  >({});

  const getRevision = useCallback(
    (campaignId: number) => revisionsByCampaignId[campaignId] ?? 0,
    [revisionsByCampaignId],
  );

  const bumpRevision = useCallback((campaignId: number) => {
    setRevisionsByCampaignId((prev) => ({
      ...prev,
      [campaignId]: (prev[campaignId] ?? 0) + 1,
    }));
  }, []);

  const value = useMemo(
    () => ({ getRevision, bumpRevision }),
    [getRevision, bumpRevision],
  );

  return (
    <SimulationHistoryRefreshContext.Provider value={value}>
      {children}
    </SimulationHistoryRefreshContext.Provider>
  );
}

export function useSimulationHistoryRefresh(): SimulationHistoryRefreshContextValue {
  const context = useContext(SimulationHistoryRefreshContext);
  if (!context) {
    throw new Error(
      "useSimulationHistoryRefresh doit être utilisé dans SimulationHistoryRefreshProvider.",
    );
  }
  return context;
}
