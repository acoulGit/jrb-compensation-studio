export type PageId =
  | "dashboard"
  | "campaigns"
  | "references"
  | "imports"
  | "simulations"
  | "individual-review"
  | "reports"
  | "settings"
  | "about";

export interface NavigationItem {
  id: PageId;
  label: string;
  symbol: string;
}

export const primaryNavigation: NavigationItem[] = [
  { id: "dashboard", label: "Tableau de bord", symbol: "TB" },
  { id: "campaigns", label: "Campagnes", symbol: "CA" },
  { id: "references", label: "Référentiels", symbol: "RE" },
  { id: "imports", label: "Import RH", symbol: "IR" },
  { id: "simulations", label: "Simulation", symbol: "SI" },
  { id: "individual-review", label: "Revue individuelle", symbol: "RI" },
  { id: "reports", label: "Rapports", symbol: "RA" },
];

export const secondaryNavigation: NavigationItem[] = [
  { id: "settings", label: "Paramètres", symbol: "PA" },
  { id: "about", label: "À propos", symbol: "AP" },
];
