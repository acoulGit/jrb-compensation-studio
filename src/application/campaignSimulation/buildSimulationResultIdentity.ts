/**
 * Identité logique d'un résultat de simulation courant (Lot 2B-4B).
 *
 * Objectif : garantir qu'une exécution donnée = une sauvegarde max par session,
 * tout en distinguant deux configurations différentes.
 *
 * `sourceFingerprint` et `configurationFingerprint` sont produits par le moteur
 * et **encodent déjà** la configuration validée du contrat v4 — dont la
 * rétroactivité (`retroactivityStartMonth`), le mois d'application technique
 * (`technicalApplicationMonth`), la politique de minimum garanti
 * (`minimumIncreaseMode` + montant/taux), l'arrondi, l'année de campagne, le
 * mode d'évaluation et le lot RH courant. Deux configurations distinctes
 * produisent donc des empreintes distinctes, et par conséquent des identités
 * distinctes, sans qu'il soit nécessaire de dupliquer ces champs.
 *
 * Les champs de configuration validée restent acceptés en option pour renforcer
 * explicitement la discrimination (et documenter l'intention) sans recalcul :
 * ils sont simplement concaténés lorsqu'ils sont fournis. Lorsqu'aucun n'est
 * fourni, l'identité conserve exactement le format historique
 * `campaignId|runSequence|sourceFingerprint|configurationFingerprint`.
 */

import type { ExactAmount } from "../../domain/compensationCalculation";

export interface SimulationResultIdentityConfigFields {
  retroactivityStartMonth?: number | null;
  technicalApplicationMonth?: number | null;
  minimumIncreaseMode?: string | null;
  minimumMonthlyAmountFcfa?: bigint | null;
  minimumIncreaseRate?: ExactAmount | null;
  roundingStepFcfa?: bigint | null;
  campaignYear?: number | null;
  evaluationMode?: string | null;
  currentImportBatchId?: number | null;
}

export interface SimulationResultIdentityInput
  extends SimulationResultIdentityConfigFields {
  campaignId: number;
  runSequence: number;
  sourceFingerprint: string;
  configurationFingerprint: string;
}

function formatConfigValue(
  value: number | bigint | string | ExactAmount | null | undefined,
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "object") {
    return `${value.numerator.toString()}/${value.denominator.toString()}`;
  }
  return String(value);
}

/**
 * Champs de configuration validée pris en compte, dans un ordre stable. Ne pas
 * réordonner : l'identité doit rester déterministe entre exécutions.
 */
const CONFIG_FIELD_ORDER: (keyof SimulationResultIdentityConfigFields)[] = [
  "retroactivityStartMonth",
  "technicalApplicationMonth",
  "minimumIncreaseMode",
  "minimumMonthlyAmountFcfa",
  "minimumIncreaseRate",
  "roundingStepFcfa",
  "campaignYear",
  "evaluationMode",
  "currentImportBatchId",
];

export function buildSimulationResultIdentity(
  input: SimulationResultIdentityInput,
): string {
  const base = [
    String(input.campaignId),
    String(input.runSequence),
    input.sourceFingerprint,
    input.configurationFingerprint,
  ].join("|");

  const providedConfigFields = CONFIG_FIELD_ORDER.filter(
    (field) => input[field] !== undefined && input[field] !== null,
  );

  if (providedConfigFields.length === 0) {
    return base;
  }

  const configDigest = CONFIG_FIELD_ORDER.map((field) =>
    formatConfigValue(input[field]),
  ).join("~");

  return `${base}|cfg:${configDigest}`;
}
