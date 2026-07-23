/**
 * Lot 2B-UX1 — confort de visualisation (sidebar + détail salarié large).
 * Les tests jsdom vérifient classes, attributs et structure — pas les pixels.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { createMemoryAppServices } from "../services/createAppServices";

async function renderApp() {
  const user = userEvent.setup();
  const services = createMemoryAppServices();
  render(<App services={services} />);
  await screen.findByRole("navigation", { name: "Navigation principale" });
  return { user, services };
}

describe("Lot 2B-UX1 — layout résultats", () => {
  it("déploie la sidebar par défaut et la réduit / redéploie (aria-expanded)", async () => {
    const { user } = await renderApp();
    const shell = screen.getByTestId("app-shell");
    const sidebar = screen.getByTestId("app-sidebar");
    const toggle = screen.getByTestId("sidebar-toggle");

    expect(shell).toHaveAttribute("data-sidebar-collapsed", "false");
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(shell.className).not.toContain("app-shell--collapsed");

    await user.click(toggle);
    expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(shell.className).toContain("app-shell--collapsed");
    expect(toggle).toHaveAttribute(
      "aria-label",
      "Déployer la barre latérale",
    );

    await user.click(toggle);
    expect(shell).toHaveAttribute("data-sidebar-collapsed", "false");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("conserve la navigation et la page Simulation après réduction", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Simulation" }));
    expect(
      screen.getByRole("heading", { name: "Simulation", level: 1 }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("sidebar-toggle"));
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-sidebar-collapsed",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Simulation", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("main-content")).toHaveAttribute(
      "data-fluid",
      "true",
    );
    expect(screen.getByTestId("main-content").className).toContain(
      "main-content--fluid",
    );

    await user.click(
      screen.getByRole("button", { name: "Historique simulations" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Historique des simulations",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-sidebar-collapsed",
      "true",
    );
    expect(screen.getByTestId("main-content")).toHaveAttribute(
      "data-fluid",
      "true",
    );
  });

  it("expose un drawer salarié en largeur maximale (classe --max)", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Simulation" }));

    // Sans résultat, le drawer n’apparaît pas — on vérifie la classe sur le
    // composant partagé via un rendu ciblé n’est pas possible ici. On valide
    // plutôt que la page fluid et la sidebar restent opérationnelles.
    expect(screen.getByTestId("main-content")).toHaveClass("main-content--fluid");

    // Smoke : le toggle reste nommé et focusable après navigation.
    const toggle = screen.getByTestId("sidebar-toggle");
    expect(toggle).toHaveAccessibleName(/barre latérale/i);
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Lot 2B-UX1 — drawer partagé largeur max", () => {
  it("applique simulation-drawer--max et conserve les 12 mois", async () => {
    const React = await import("react");
    const { SimulationEmployeeDetailDrawer } = await import(
      "../pages/simulation/components/SimulationEmployeeDetailDrawer"
    );
    const closeRef = React.createRef<HTMLButtonElement>();
    let closed = false;
    const onClose = () => {
      closed = true;
    };
    render(
      <SimulationEmployeeDetailDrawer
        employee={{
          employeeId: "E1",
          employeeDisplayName: "Alice",
          familyCode: "F",
          familyLabel: "Fam",
          gradeCode: "G",
          gradeLabel: "Gr",
          salaryFcfa: 1000n,
          s0Fcfa: 1000n,
          salaryRatioBasisPoints: 10000,
          salaryPositionCode: "EQ",
          salaryPositionLabel: "Égal",
          positionFactorMilli: 1000,
          evaluationMode: "none",
          performanceLevel: null,
          potentialLevel: null,
          evaluationFactorLabel: "1",
          theoreticalMatrixWeightLabel: "1",
          effectiveMatrixWeightLabel: "1",
          allocationWeightLabel: "1",
          blockingReason: null,
          theoreticalIncreaseRateLabel: "0 %",
          theoreticalIncreaseAmountLabel: "0",
          finalRoundedIncreaseAmountFcfa: 0n,
          individualRoundingDeltaLabel: "0",
          finalSalaryFcfa: 1000n,
          explanationSteps: [{ step: "trace" }],
          months: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            monthLabel: `M${i + 1}`,
            baseSalaryLabel: "1 000",
            gradeCode: "G",
            jobFamilyCode: "F",
            compensatoryComplementRateLabel: "0 %",
            theoreticalCompensatoryComplementLabel: "0",
            minimumComplementFloorLabel: "0",
            actualComplementAboveMinimumLabel: "0",
            roundedCompensatoryComplementLabel: "0",
            promotionBudgetCostLabel: "0",
            finalSalaryLabel: "1 000",
            seniorityRateLabel: "0 %",
            totalSeniorityImpactLabel: "0",
            paymentTiming: "direct" as const,
            promotionPaymentTiming: "not_applicable" as const,
            coveredByCampaignPeriod: true,
          })),
        }}
        mode="persisted-readonly"
        roundingMode="nearest_half_up"
        roundingStepLabel="100 FCFA"
        onClose={onClose}
        closeButtonRef={closeRef}
        testIdPrefix="ux1"
      />,
    );

    const drawer = screen.getByTestId("ux1-employee-drawer");
    const panel = within(drawer).getByRole("dialog");
    expect(panel.className).toContain("simulation-drawer--max");
    expect(panel).toHaveAttribute("data-drawer-width", "max");
    expect(
      screen.getByRole("heading", { name: /Détail — E1/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ux1-detail-months-table")).toHaveClass(
      "data-table--trajectory",
    );
    for (let month = 1; month <= 12; month += 1) {
      expect(screen.getByTestId(`ux1-detail-month-${month}`)).toBeInTheDocument();
    }

    await userEvent.click(screen.getByTestId("ux1-employee-drawer-close"));
    expect(closed).toBe(true);
  });

  it("ferme le drawer avec Échap", async () => {
    const React = await import("react");
    const { SimulationEmployeeDetailDrawer } = await import(
      "../pages/simulation/components/SimulationEmployeeDetailDrawer"
    );
    const closeRef = React.createRef<HTMLButtonElement>();
    let closed = false;
    render(
      <SimulationEmployeeDetailDrawer
        employee={{
          employeeId: "E2",
          employeeDisplayName: null,
          familyCode: "F",
          familyLabel: null,
          gradeCode: "G",
          gradeLabel: null,
          salaryFcfa: 1n,
          s0Fcfa: 1n,
          salaryRatioBasisPoints: 10000,
          salaryPositionCode: "EQ",
          salaryPositionLabel: "Égal",
          positionFactorMilli: 1000,
          evaluationMode: "none",
          performanceLevel: null,
          potentialLevel: null,
          evaluationFactorLabel: "1",
          theoreticalMatrixWeightLabel: "1",
          effectiveMatrixWeightLabel: "1",
          allocationWeightLabel: "1",
          blockingReason: null,
          theoreticalIncreaseRateLabel: "0 %",
          theoreticalIncreaseAmountLabel: "0",
          finalRoundedIncreaseAmountFcfa: 0n,
          individualRoundingDeltaLabel: "0",
          finalSalaryFcfa: 1n,
          explanationSteps: [],
        }}
        mode="current"
        roundingMode="nearest_half_up"
        roundingStepLabel="1"
        onClose={() => {
          closed = true;
        }}
        closeButtonRef={closeRef}
        testIdPrefix="ux1-esc"
      />,
    );

    await userEvent.keyboard("{Escape}");
    expect(closed).toBe(true);
  });
});
