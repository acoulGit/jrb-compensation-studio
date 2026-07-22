/** Tableau salariés partagé courant / historique (Lot 2B-4B). */

import { useMemo, useState } from "react";
import { formatFcfaInteger } from "../../../application/campaignSimulation/formatExactBudgetDisplay";
import type { SimulationEmployeeViewModel } from "../../../application/campaignSimulation/simulationViewModels";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import {
  compareEmployeeId,
  levelOrNotRequired,
  SIMULATION_EMPLOYEE_PAGE_SIZE_OPTIONS,
} from "./simulationViewUtils";

interface SimulationEmployeeTableProps {
  employees: readonly SimulationEmployeeViewModel[];
  testIdPrefix?: string;
  onOpenEmployee: (employeeId: string) => void;
}

export function SimulationEmployeeTable({
  employees,
  testIdPrefix = "simulation",
  onOpenEmployee,
}: SimulationEmployeeTableProps) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] =
    useState<(typeof SIMULATION_EMPLOYEE_PAGE_SIZE_OPTIONS)[number]>(25);
  const [pageIndex, setPageIndex] = useState(0);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const sorted = [...employees].sort((left, right) =>
      compareEmployeeId(left.employeeId, right.employeeId),
    );
    if (!needle) return sorted;
    return sorted.filter((employee) => {
      const idMatch = employee.employeeId.toLowerCase().includes(needle);
      const nameMatch = employee.employeeDisplayName
        ?.toLowerCase()
        .includes(needle);
      return idMatch || Boolean(nameMatch);
    });
  }, [employees, search]);

  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageItems = filteredEmployees.slice(
    safePageIndex * pageSize,
    safePageIndex * pageSize + pageSize,
  );

  return (
    <>
      <div className="references-toolbar">
        <label className="field" htmlFor={`${testIdPrefix}-results-search`}>
          Recherche (matricule ou nom)
          <input
            id={`${testIdPrefix}-results-search`}
            data-testid={`${testIdPrefix}-results-search`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageIndex(0);
            }}
          />
        </label>
        <label className="field" htmlFor={`${testIdPrefix}-results-page-size`}>
          Lignes par page
          <select
            id={`${testIdPrefix}-results-page-size`}
            data-testid={`${testIdPrefix}-results-page-size`}
            value={pageSize}
            onChange={(event) => {
              setPageSize(
                Number(event.target.value) as (typeof SIMULATION_EMPLOYEE_PAGE_SIZE_OPTIONS)[number],
              );
              setPageIndex(0);
            }}
          >
            {SIMULATION_EMPLOYEE_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="data-table-wrap"
        data-testid={`${testIdPrefix}-results-table-wrap`}
      >
        <table className="data-table" data-testid={`${testIdPrefix}-results-table`}>
          <thead>
            <tr>
              <th scope="col">Matricule</th>
              <th scope="col">Salarié</th>
              <th scope="col">Famille / Grade</th>
              <th scope="col">Salaire</th>
              <th scope="col">S0</th>
              <th scope="col">Position</th>
              <th scope="col">Performance</th>
              <th scope="col">Potentiel</th>
              <th scope="col">Taux théorique</th>
              <th scope="col">Montant théorique</th>
              <th scope="col">Montant final</th>
              <th scope="col">Nouveau salaire</th>
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((employee) => (
              <tr key={employee.employeeId}>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    data-testid={`${testIdPrefix}-employee-open-${employee.employeeId}`}
                    onClick={() => {
                      onOpenEmployee(employee.employeeId);
                    }}
                  >
                    {employee.employeeId}
                  </button>
                </td>
                <td>{employee.employeeDisplayName ?? "—"}</td>
                <td>
                  {employee.familyCode} / {employee.gradeCode}
                </td>
                <td>{formatFcfaInteger(employee.salaryFcfa)}</td>
                <td>{formatFcfaInteger(employee.s0Fcfa)}</td>
                <td>{employee.salaryPositionLabel}</td>
                <td>
                  {levelOrNotRequired(
                    employee.performanceLevel,
                    employee.evaluationMode !== "none",
                  )}
                </td>
                <td>
                  {levelOrNotRequired(
                    employee.potentialLevel,
                    employee.evaluationMode === "performance_potential" ||
                      employee.evaluationMode === "full_nine_box",
                  )}
                </td>
                <td>{employee.theoreticalIncreaseRateLabel}</td>
                <td>{employee.theoreticalIncreaseAmountLabel}</td>
                <td>
                  {formatFcfaInteger(employee.finalRoundedIncreaseAmountFcfa)}
                </td>
                <td
                  data-testid={`${testIdPrefix}-final-salary-${employee.employeeId}`}
                >
                  {formatFcfaInteger(employee.finalSalaryFcfa)}
                </td>
                <td>
                  {employee.blockingReason === "CONFIRMED_UNDERPERFORMER" ? (
                    <StatusBadge
                      tone="warning"
                      data-testid={`${testIdPrefix}-underperformer-${employee.employeeId}`}
                    >
                      Sous-performant confirmé
                    </StatusBadge>
                  ) : employee.blockingReason ? (
                    employee.blockingReason
                  ) : (
                    "OK"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-actions" data-testid={`${testIdPrefix}-results-pagination`}>
        <button
          type="button"
          disabled={safePageIndex <= 0}
          data-testid={`${testIdPrefix}-results-prev`}
          onClick={() => {
            setPageIndex((current) => Math.max(0, current - 1));
          }}
        >
          Précédent
        </button>
        <span>
          Page {safePageIndex + 1} / {pageCount} ({filteredEmployees.length}{" "}
          salarié
          {filteredEmployees.length > 1 ? "s" : ""})
        </span>
        <button
          type="button"
          disabled={safePageIndex >= pageCount - 1}
          data-testid={`${testIdPrefix}-results-next`}
          onClick={() => {
            setPageIndex((current) => Math.min(pageCount - 1, current + 1));
          }}
        >
          Suivant
        </button>
      </div>
    </>
  );
}
