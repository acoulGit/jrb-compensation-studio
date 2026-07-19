/** Résolution déterministe de la position salariale (Lot 2A-2). */

import { isValidFactorMilli } from "../compensationReference/validationHelpers";
import {
  absBigInt,
  computeDisplayRatioBasisPoints,
  formatRatioBpsForDisplay,
} from "./arithmetic";
import { CompensationCalculationError } from "./errors";
import type {
  CalculationExplanationStep,
  SalaryPositionInput,
  SalaryPositionInputRow,
  SalaryPositionResult,
} from "./models";

interface AnchorPosition {
  position: SalaryPositionInputRow;
  ratioBps: number;
}

function assertPositiveInteger(
  value: number,
  code: "INVALID_SALARY" | "INVALID_S0",
  message: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CompensationCalculationError(code, message);
  }
}

function normalizeCode(code: string): string {
  return code.trim();
}

/**
 * Valide le référentiel de positions et extrait les ancres (ratios non nuls).
 * Convention JRB : classement au point de référence le plus proche.
 */
function prepareAnchors(
  salaryPositions: readonly SalaryPositionInputRow[],
): {
  soutMinus: SalaryPositionInputRow;
  soutPlus: SalaryPositionInputRow;
  anchors: AnchorPosition[];
} {
  if (salaryPositions.length === 0) {
    throw new CompensationCalculationError(
      "EMPTY_POSITION_REFERENCE",
      "Le référentiel de positions salariales est vide.",
    );
  }

  const codes = new Set<string>();
  for (const position of salaryPositions) {
    const code = normalizeCode(position.code);
    if (!code) {
      throw new CompensationCalculationError(
        "INCOHERENT_POSITION_THRESHOLDS",
        "Une position salariale a un code vide.",
      );
    }
    if (codes.has(code)) {
      throw new CompensationCalculationError(
        "DUPLICATE_POSITION",
        `Position salariale dupliquée : ${code}.`,
      );
    }
    codes.add(code);
    if (!isValidFactorMilli(position.positionFactorMilli)) {
      throw new CompensationCalculationError(
        "INVALID_FACTOR",
        `Coefficient de position invalide pour ${code}.`,
      );
    }
  }

  const soutMinus = salaryPositions.find(
    (position) => normalizeCode(position.code) === "Sout-",
  );
  const soutPlus = salaryPositions.find(
    (position) => normalizeCode(position.code) === "Sout+",
  );
  if (!soutMinus || !soutPlus) {
    throw new CompensationCalculationError(
      "INCOHERENT_POSITION_THRESHOLDS",
      "Le référentiel doit contenir les positions Sout- et Sout+.",
    );
  }
  if (soutMinus.referenceRatioBps !== null || soutPlus.referenceRatioBps !== null) {
    throw new CompensationCalculationError(
      "INCOHERENT_POSITION_THRESHOLDS",
      "Sout- et Sout+ doivent avoir un ratio de référence null.",
    );
  }

  const anchors: AnchorPosition[] = [];
  const ratioSeen = new Set<number>();
  for (const position of salaryPositions) {
    const code = normalizeCode(position.code);
    if (code === "Sout-" || code === "Sout+") {
      continue;
    }
    if (position.referenceRatioBps === null) {
      throw new CompensationCalculationError(
        "INCOHERENT_POSITION_THRESHOLDS",
        `La position ${code} doit avoir un ratio de référence.`,
      );
    }
    if (
      !Number.isInteger(position.referenceRatioBps) ||
      position.referenceRatioBps <= 0
    ) {
      throw new CompensationCalculationError(
        "INCOHERENT_POSITION_THRESHOLDS",
        `Ratio de référence invalide pour ${code}.`,
      );
    }
    if (ratioSeen.has(position.referenceRatioBps)) {
      throw new CompensationCalculationError(
        "DUPLICATE_POSITION",
        `Ratio de référence dupliqué : ${position.referenceRatioBps} bps.`,
      );
    }
    ratioSeen.add(position.referenceRatioBps);
    anchors.push({ position, ratioBps: position.referenceRatioBps });
  }

  if (anchors.length === 0) {
    throw new CompensationCalculationError(
      "EMPTY_POSITION_REFERENCE",
      "Aucune ancre de ratio (S7-…S7+) dans le référentiel.",
    );
  }

  anchors.sort((left, right) => left.ratioBps - right.ratioBps);
  for (let index = 1; index < anchors.length; index += 1) {
    if (anchors[index].ratioBps <= anchors[index - 1].ratioBps) {
      throw new CompensationCalculationError(
        "INCOHERENT_POSITION_THRESHOLDS",
        "Les ratios de référence des positions doivent être strictement croissants.",
      );
    }
  }

  return { soutMinus, soutPlus, anchors };
}

function nearestAnchor(
  salaryFcfa: bigint,
  s0Fcfa: bigint,
  anchors: readonly AnchorPosition[],
): AnchorPosition {
  // Distance |salary/s0 - R/10000| ∝ |salary*10000 - s0*R|
  const scaledSalary = salaryFcfa * 10_000n;
  let best = anchors[0];
  let bestDistance = absBigInt(scaledSalary - s0Fcfa * BigInt(best.ratioBps));

  for (let index = 1; index < anchors.length; index += 1) {
    const candidate = anchors[index];
    const distance = absBigInt(
      scaledSalary - s0Fcfa * BigInt(candidate.ratioBps),
    );
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      continue;
    }
    // Égalité à mi-chemin : retenir le ratio supérieur.
    if (distance === bestDistance && candidate.ratioBps > best.ratioBps) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Bornes indicatives (bps) de la cellule de Voronoï 1D.
 * Mi-chemin exact : appartient au ratio supérieur.
 */
function boundaryForAnchor(
  anchors: readonly AnchorPosition[],
  selected: AnchorPosition,
): { lowerBoundaryBps: number | null; upperBoundaryBps: number | null } {
  const index = anchors.findIndex(
    (anchor) => anchor.ratioBps === selected.ratioBps,
  );
  const previous = index > 0 ? anchors[index - 1] : null;
  const next = index < anchors.length - 1 ? anchors[index + 1] : null;

  const lowerBoundaryBps =
    previous === null
      ? selected.ratioBps
      : Math.ceil((previous.ratioBps + selected.ratioBps) / 2);

  const upperBoundaryBps =
    next === null
      ? selected.ratioBps
      : Math.floor((selected.ratioBps + next.ratioBps - 1) / 2);

  return { lowerBoundaryBps, upperBoundaryBps };
}

/**
 * Détermine la position salariale et son facteur.
 * Convention JRB Compensation Studio (pas une règle historique Orange).
 */
export function resolveSalaryPosition(
  input: SalaryPositionInput,
): SalaryPositionResult {
  assertPositiveInteger(
    input.salaryFcfa,
    "INVALID_SALARY",
    "Le salaire doit être un entier FCFA strictement positif.",
  );
  assertPositiveInteger(
    input.s0Fcfa,
    "INVALID_S0",
    "Le S0 doit être un entier FCFA strictement positif.",
  );

  const { soutMinus, soutPlus, anchors } = prepareAnchors(input.salaryPositions);
  const minAnchor = anchors[0];
  const maxAnchor = anchors[anchors.length - 1];

  const salaryBig = BigInt(input.salaryFcfa);
  const s0Big = BigInt(input.s0Fcfa);
  const scaledSalary = salaryBig * 10_000n;
  const minThreshold = s0Big * BigInt(minAnchor.ratioBps);
  const maxThreshold = s0Big * BigInt(maxAnchor.ratioBps);

  const ratioBasisPoints = computeDisplayRatioBasisPoints(
    input.salaryFcfa,
    input.s0Fcfa,
  );

  const explanation: CalculationExplanationStep[] = [
    {
      code: "INPUT_SALARY_S0",
      label: "Entrées salaire et S0",
      inputValues: {
        salaryFcfa: input.salaryFcfa,
        s0Fcfa: input.s0Fcfa,
      },
      outputValue: null,
      formula: "ratio = salaryFcfa / s0Fcfa",
      reason: "Données individuelles et médiane de référence.",
    },
    {
      code: "DISPLAY_RATIO_BPS",
      label: "Ratio affiché (basis points, half-up)",
      inputValues: {
        salaryFcfa: input.salaryFcfa,
        s0Fcfa: input.s0Fcfa,
      },
      outputValue: ratioBasisPoints,
      formula: "round_half_up(salaryFcfa * 10000 / s0Fcfa)",
      reason: `Affichage ${formatRatioBpsForDisplay(ratioBasisPoints)} ; non utilisé pour le classement.`,
    },
  ];

  let selected: SalaryPositionInputRow;
  let referenceRatioBps: number | null;
  let lowerBoundaryBps: number | null;
  let upperBoundaryBps: number | null;
  let selectionReason: string;

  if (scaledSalary < minThreshold) {
    selected = soutMinus;
    referenceRatioBps = null;
    lowerBoundaryBps = null;
    upperBoundaryBps = null;
    selectionReason = `Ratio strictement inférieur à ${minAnchor.ratioBps} bps (${normalizeCode(minAnchor.position.code)}).`;
    explanation.push({
      code: "POSITION_SOUT_MINUS",
      label: "Position Sout-",
      inputValues: {
        minAnchorBps: minAnchor.ratioBps,
        comparison: "salary * 10000 < s0 * minAnchor",
      },
      outputValue: selected.code,
      formula: "salaryFcfa * 10000 < s0Fcfa * minAnchorBps",
      reason: selectionReason,
    });
  } else if (scaledSalary > maxThreshold) {
    selected = soutPlus;
    referenceRatioBps = null;
    lowerBoundaryBps = null;
    upperBoundaryBps = null;
    selectionReason = `Ratio strictement supérieur à ${maxAnchor.ratioBps} bps (${normalizeCode(maxAnchor.position.code)}).`;
    explanation.push({
      code: "POSITION_SOUT_PLUS",
      label: "Position Sout+",
      inputValues: {
        maxAnchorBps: maxAnchor.ratioBps,
        comparison: "salary * 10000 > s0 * maxAnchor",
      },
      outputValue: selected.code,
      formula: "salaryFcfa * 10000 > s0Fcfa * maxAnchorBps",
      reason: selectionReason,
    });
  } else {
    const anchor = nearestAnchor(salaryBig, s0Big, anchors);
    selected = anchor.position;
    referenceRatioBps = anchor.ratioBps;
    const bounds = boundaryForAnchor(anchors, anchor);
    lowerBoundaryBps = bounds.lowerBoundaryBps;
    upperBoundaryBps = bounds.upperBoundaryBps;
    selectionReason =
      "Point de référence le plus proche ; en cas d’égalité à mi-chemin, ratio supérieur.";
    explanation.push({
      code: "POSITION_NEAREST_ANCHOR",
      label: "Position par ancre la plus proche",
      inputValues: {
        selectedRatioBps: anchor.ratioBps,
        lowerBoundaryBps,
        upperBoundaryBps,
      },
      outputValue: selected.code,
      formula:
        "argmin |salary*10000 - s0*R| ; tie → max(R)",
      reason: selectionReason,
    });
  }

  if (!selected) {
    throw new CompensationCalculationError(
      "POSITION_NOT_FOUND",
      "Aucune position salariale n’a pu être déterminée.",
    );
  }

  explanation.push({
    code: "POSITION_FACTOR",
    label: "Facteur de position",
    inputValues: {
      positionCode: selected.code,
      positionFactorMilli: selected.positionFactorMilli,
    },
    outputValue: selected.positionFactorMilli,
    formula: "positionFactorMilli (paramètre campagne)",
    reason: "Coefficient reparamétrable associé à la position retenue.",
  });

  return {
    salaryFcfa: input.salaryFcfa,
    s0Fcfa: input.s0Fcfa,
    ratioBasisPoints,
    positionCode: selected.code,
    positionLabel: selected.label,
    positionFactorMilli: selected.positionFactorMilli,
    lowerBoundaryBps,
    upperBoundaryBps,
    referenceRatioBps,
    explanation,
  };
}
