/**
 * Mécanisme social de campagne (Lot 2B-RC1-H5).
 *
 * Exclusivité typée : une campagne active au plus un mécanisme parmi
 * aucun / minimum garanti / forfait social universel.
 * Le minimum garanti conserve sa sémantique de plancher (H2D-2 / H4) ;
 * le forfait social universel est une composante additive distincte.
 */

export const SOCIAL_MECHANISM_KINDS = [
  "none",
  "minimum_guaranteed",
  "universal_fixed_amount",
] as const;

export type SocialMechanismKind = (typeof SOCIAL_MECHANISM_KINDS)[number];

export const SOCIAL_MECHANISM_KIND_LABELS_FR: Readonly<
  Record<SocialMechanismKind, string>
> = {
  none: "Aucun",
  minimum_guaranteed: "Minimum garanti",
  universal_fixed_amount: "Forfait social universel",
};

export function isSocialMechanismKind(
  value: unknown,
): value is SocialMechanismKind {
  return (
    typeof value === "string" &&
    (SOCIAL_MECHANISM_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Dérive le mécanisme social depuis une politique de minimum historique
 * (snapshots / brouillons antérieurs à H5).
 * Jamais de forfait universel implicite.
 */
export function deriveSocialMechanismKindFromMinimumIncreaseMode(
  mode: string | null | undefined,
): SocialMechanismKind {
  if (mode === "fixed_monthly_amount" || mode === "percentage_of_base_salary") {
    return "minimum_guaranteed";
  }
  return "none";
}
