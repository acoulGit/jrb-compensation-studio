import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Campaign,
  CampaignDraftInput,
  OrganizationProfile,
  OrganizationProfileInput,
} from "../infrastructure/database/types";
import {
  createSqliteAppServices,
  type AppServices,
} from "../services/createAppServices";
import { toUserMessage } from "../services/errors";

export type AppDataStatus = "loading" | "ready" | "error";

interface AppDataContextValue {
  status: AppDataStatus;
  errorMessage: string | null;
  organization: OrganizationProfile | null;
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  services: AppServices;
  retry: () => void;
  saveOrganization: (
    input: OrganizationProfileInput,
  ) => Promise<OrganizationProfile>;
  createCampaign: (input: CampaignDraftInput) => Promise<Campaign>;
  updateCampaign: (
    id: number,
    input: CampaignDraftInput,
  ) => Promise<Campaign>;
  activateCampaign: (id: number) => Promise<Campaign>;
  archiveCampaign: (id: number) => Promise<Campaign>;
  restoreCampaign: (id: number) => Promise<Campaign>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

interface AppDataProviderProps {
  children: ReactNode;
  services?: AppServices;
  /** Permet de forcer une erreur d’initialisation dans les tests. */
  initializeErrorFactory?: () => Error | null;
}

export function AppDataProvider({
  children,
  services,
  initializeErrorFactory,
}: AppDataProviderProps) {
  const resolvedServices = useMemo(
    () => services ?? createSqliteAppServices(),
    [services],
  );
  const [status, setStatus] = useState<AppDataStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationProfile | null>(
    null,
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const loadData = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const forcedError = initializeErrorFactory?.() ?? null;
      if (forcedError) {
        throw forcedError;
      }

      const [profile, list, active] = await Promise.all([
        resolvedServices.organization.getProfile(),
        resolvedServices.campaign.listCampaigns(),
        resolvedServices.campaign.getActiveCampaign(),
      ]);

      setOrganization(profile);
      setCampaigns(list);
      setActiveCampaign(active);
      setStatus("ready");
    } catch (error) {
      console.error("Échec d’initialisation de la base locale", error);
      setOrganization(null);
      setCampaigns([]);
      setActiveCampaign(null);
      setErrorMessage(
        "La base locale n’a pas pu être ouverte. Vérifiez que l’application dispose des droits nécessaires sur ce poste, puis réessayez.",
      );
      setStatus("error");
    }
  }, [initializeErrorFactory, resolvedServices]);

  useEffect(() => {
    void loadData();
  }, [loadData, reloadToken]);

  const refreshAfterMutation = useCallback(async () => {
    const [profile, list, active] = await Promise.all([
      resolvedServices.organization.getProfile(),
      resolvedServices.campaign.listCampaigns(),
      resolvedServices.campaign.getActiveCampaign(),
    ]);
    setOrganization(profile);
    setCampaigns(list);
    setActiveCampaign(active);
  }, [resolvedServices]);

  const saveOrganization = useCallback(
    async (input: OrganizationProfileInput) => {
      try {
        const profile =
          await resolvedServices.organization.updateProfile(input);
        await refreshAfterMutation();
        return profile;
      } catch (error) {
        throw new Error(
          toUserMessage(
            error,
            "L’enregistrement de l’organisation a échoué.",
          ),
        );
      }
    },
    [refreshAfterMutation, resolvedServices],
  );

  const createCampaign = useCallback(
    async (input: CampaignDraftInput) => {
      try {
        const campaign = await resolvedServices.campaign.createCampaign(input);
        await refreshAfterMutation();
        return campaign;
      } catch (error) {
        throw new Error(
          toUserMessage(error, "La création de la campagne a échoué."),
        );
      }
    },
    [refreshAfterMutation, resolvedServices],
  );

  const updateCampaign = useCallback(
    async (id: number, input: CampaignDraftInput) => {
      try {
        const campaign = await resolvedServices.campaign.updateCampaign(
          id,
          input,
        );
        await refreshAfterMutation();
        return campaign;
      } catch (error) {
        throw new Error(
          toUserMessage(error, "La modification de la campagne a échoué."),
        );
      }
    },
    [refreshAfterMutation, resolvedServices],
  );

  const activateCampaign = useCallback(
    async (id: number) => {
      try {
        const campaign = await resolvedServices.campaign.activateCampaign(id);
        await refreshAfterMutation();
        return campaign;
      } catch (error) {
        throw new Error(
          toUserMessage(error, "L’activation de la campagne a échoué."),
        );
      }
    },
    [refreshAfterMutation, resolvedServices],
  );

  const archiveCampaign = useCallback(
    async (id: number) => {
      try {
        const campaign = await resolvedServices.campaign.archiveCampaign(id);
        await refreshAfterMutation();
        return campaign;
      } catch (error) {
        throw new Error(
          toUserMessage(error, "L’archivage de la campagne a échoué."),
        );
      }
    },
    [refreshAfterMutation, resolvedServices],
  );

  const restoreCampaign = useCallback(
    async (id: number) => {
      try {
        const campaign = await resolvedServices.campaign.restoreCampaign(id);
        await refreshAfterMutation();
        return campaign;
      } catch (error) {
        throw new Error(
          toUserMessage(error, "La restauration de la campagne a échoué."),
        );
      }
    },
    [refreshAfterMutation, resolvedServices],
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      status,
      errorMessage,
      organization,
      campaigns,
      activeCampaign,
      services: resolvedServices,
      retry: () => setReloadToken((token) => token + 1),
      saveOrganization,
      createCampaign,
      updateCampaign,
      activateCampaign,
      archiveCampaign,
      restoreCampaign,
    }),
    [
      activateCampaign,
      activeCampaign,
      archiveCampaign,
      campaigns,
      createCampaign,
      errorMessage,
      organization,
      resolvedServices,
      restoreCampaign,
      saveOrganization,
      status,
      updateCampaign,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData doit être utilisé dans AppDataProvider.");
  }
  return context;
}
