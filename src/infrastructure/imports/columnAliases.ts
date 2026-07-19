/** Alias reconnus (français et anglais) pour chaque colonne d’import RH. */

import { normalizeHeaderKey } from "../../domain/hrImport/normalizeKey";
import type { HrImportColumnKey } from "../../domain/hrImport/models";

const RAW_ALIASES: Readonly<Record<HrImportColumnKey, readonly string[]>> = {
  employeeNumber: [
    "matricule",
    "matricule salarié",
    "n° matricule",
    "numero matricule",
    "numéro matricule",
    "numéro employé",
    "numéro salarié",
    "code employé",
    "id salarié",
    "employee number",
    "employee_number",
    "employeenumber",
    "employee id",
    "employee_id",
    "employee code",
    "matricule employe",
  ],
  employeeLabel: [
    "nom",
    "nom salarié",
    "nom complet",
    "nom et prenoms",
    "nom et prénoms",
    "nom et prénom",
    "nom prénom",
    "prénom et nom",
    "salarie",
    "salarié",
    "libellé salarié",
    "employee label",
    "employee_label",
    "employeelabel",
    "employee name",
    "full name",
    "name",
  ],
  jobFamilyCode: [
    "famille",
    "famille metier",
    "famille métier",
    "famille de métiers",
    "code famille",
    "job family",
    "job_family",
    "jobfamily",
    "family",
    "family code",
  ],
  gradeCode: [
    "grade",
    "code grade",
    "niveau",
    "grade salarié",
    "employee grade",
    "job grade",
    "job_grade",
    "grade code",
  ],
  contractType: [
    "type de contrat",
    "type contrat",
    "contrat",
    "nature du contrat",
    "contract type",
    "contract",
  ],
  employmentStatus: [
    "statut",
    "statut d’emploi",
    "statut emploi",
    "situation",
    "situation d’emploi",
    "employment status",
    "status",
  ],
  hireDate: [
    "date d’entrée",
    "date entrée",
    "date d’embauche",
    "date embauche",
    "date d’arrivée",
    "date arrivée",
    "hire date",
    "date of hire",
    "start date",
  ],
  decemberBaseSalary: [
    "salaire de base décembre",
    "salaire de base décembre n-1",
    "salaire base décembre",
    "salaire décembre",
    "salaire décembre n-1",
    "salaire de base",
    "december base salary",
    "december salary",
    "base salary december",
  ],
  nineBoxCode: [
    "code 9-box",
    "code 9 box",
    "9-box",
    "9 box",
    "9box",
    "case 9-box",
    "position 9-box",
    "nine box",
    "nine box code",
  ],
  confirmedUnderperformer: [
    "sous-performant confirmé",
    "sous performant confirmé",
    "sous-performant",
    "confirmed underperformer",
    "underperformer",
  ],
  promotionAmount: [
    "montant de promotion",
    "montant promotion",
    "promotion",
    "promotion amount",
  ],
  correctionAmount: [
    "montant de correction",
    "montant correction",
    "correction",
    "correction amount",
  ],
  socialMeasureAmount: [
    "montant mesure rh",
    "montant mesure sociale",
    "mesure rh",
    "mesure sociale",
    "social measure",
    "social measure amount",
  ],
};

export const COLUMN_ALIASES: Readonly<Record<string, HrImportColumnKey>> =
  buildAliasMap();

function buildAliasMap(): Record<string, HrImportColumnKey> {
  const map: Record<string, HrImportColumnKey> = {};
  for (const [field, aliases] of Object.entries(RAW_ALIASES) as Array<
    [HrImportColumnKey, readonly string[]]
  >) {
    for (const alias of aliases) {
      const normalized = normalizeHeaderKey(alias);
      if (normalized) {
        map[normalized] = field;
      }
    }
  }
  return map;
}

export function resolveColumnAlias(header: string): HrImportColumnKey | null {
  const normalized = normalizeHeaderKey(header);
  return COLUMN_ALIASES[normalized] ?? null;
}
