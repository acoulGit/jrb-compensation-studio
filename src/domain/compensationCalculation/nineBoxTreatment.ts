/**
 * Traitement d’évaluation 9-Box retenu pour un salarié.
 * Lot 2B-RC1-H1 : neutralisation → facteur 1.
 * Lot 2B-RC1-H2 : même déclencheur → performance en cours de confirmation.
 * Codes stables machine ; libellés français pour UI / export.
 */

export type NineBoxTreatmentKind =
  | "nine_box_code_applied"
  | "nine_box_effect_neutralized"
  | "missing_nine_box_data_treatment"
  | "performance_pending_confirmation";

export const NINE_BOX_TREATMENT_LABELS: Readonly<
  Record<NineBoxTreatmentKind, string>
> = {
  nine_box_code_applied: "Code 9-Box appliqué",
  nine_box_effect_neutralized: "Effet 9-Box neutralisé",
  missing_nine_box_data_treatment: "Traitement des données 9-Box manquantes",
  performance_pending_confirmation: "Performance en cours de confirmation",
};

export function formatNineBoxTreatmentLabel(
  kind: NineBoxTreatmentKind | null | undefined,
): string | null {
  if (kind == null) return null;
  return NINE_BOX_TREATMENT_LABELS[kind] ?? null;
}

/**
 * Détermine le traitement d’évaluation retenu (contrat ≥ 6).
 * La sous-performance confirmée reste orthogonale (blocage poids = 0) ;
 * l’UI peut afficher « Sous-performance confirmée » en priorité visuelle.
 */
export function resolveNineBoxTreatmentKind(input: {
  neutralizeNineBoxEffect: boolean;
  sourceNineBoxCode: number | null | undefined;
  /** Si true (contrat 6+), utilise le traitement « confirmation » plutôt que « neutralisé ». */
  usePendingConfirmationSemantics?: boolean;
}): NineBoxTreatmentKind {
  if (input.neutralizeNineBoxEffect) {
    return input.usePendingConfirmationSemantics === false
      ? "nine_box_effect_neutralized"
      : "performance_pending_confirmation";
  }
  if (
    input.sourceNineBoxCode === null ||
    input.sourceNineBoxCode === undefined
  ) {
    return "missing_nine_box_data_treatment";
  }
  return "nine_box_code_applied";
}
