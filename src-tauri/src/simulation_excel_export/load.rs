//! Chargement + validation du snapshot de simulation (Lot 2B-E1).
//!
//! Aucun recalcul : lecture fidèle du snapshot append-only, avec vérification
//! des versions de schéma / contrat et de la complétude de la trajectoire.

use sqlx::SqliteConnection;

use super::error::ExportError;
use super::models::{
    EmployeeRow, EmployeeSnapshot, MonthRow, OrgProfileRow, RunRow, SimulationSnapshot,
};

pub const EXPECTED_RESULT_SCHEMA_VERSION_V3: i64 = 3;
pub const EXPECTED_RESULT_SCHEMA_VERSION_V4: i64 = 4;
/// Schema v5 — coefficient provisoire 9-Box « Performance à confirmer » (Lot 2B-RC1-H2).
pub const EXPECTED_RESULT_SCHEMA_VERSION_V5: i64 = 5;
pub const EXPECTED_CALCULATION_CONTRACT_VERSION_V4: i64 = 4;
pub const EXPECTED_CALCULATION_CONTRACT_VERSION_V5: i64 = 5;
/// Contrat v6 — coefficient provisoire 9-Box (Lot 2B-RC1-H2).
pub const EXPECTED_CALCULATION_CONTRACT_VERSION_V6: i64 = 6;
/// Contrat v7 — promotion salariale sans changement de grade (Lot 2B-RC1-H3).
pub const EXPECTED_CALCULATION_CONTRACT_VERSION_V7: i64 = 7;
pub const EXPECTED_SENIORITY_IMPACT_CONTRACT_VERSION: i64 = 1;
pub const EXPECTED_MINIMUM_INCREASE_CONTRACT_VERSION: i64 = 1;

/// Alias historique (schema courant = v5).
#[allow(dead_code)]
pub const EXPECTED_RESULT_SCHEMA_VERSION: i64 = EXPECTED_RESULT_SCHEMA_VERSION_V5;
/// Alias courant (Lot 2B-RC1-H3) : contrat v7 / schema v5.
#[allow(dead_code)]
pub const EXPECTED_CALCULATION_CONTRACT_VERSION: i64 = EXPECTED_CALCULATION_CONTRACT_VERSION_V7;

const EXPECTED_MONTH_COUNT: usize = 12;

/// Valide la séquence de mois d’un salarié : exactement {1..12}, sans doublon.
///
/// Fonction pure (testable sans base) : le contrôle des doublons est conservé
/// même si la contrainte UNIQUE(employee_result_id, month) le garantit en base.
pub fn validate_month_numbers(months: &[i64]) -> Result<(), ExportError> {
    if months.is_empty() {
        return Err(ExportError::SnapshotIncomplete(
            "Aucune trajectoire mensuelle persistée pour un salarié.".into(),
        ));
    }
    if months.len() != EXPECTED_MONTH_COUNT {
        return Err(ExportError::MonthCountInvalid);
    }
    let mut seen = [false; 13];
    for &month in months {
        if !(1..=12).contains(&month) {
            return Err(ExportError::MonthCountInvalid);
        }
        if seen[month as usize] {
            return Err(ExportError::MonthDuplicate);
        }
        seen[month as usize] = true;
    }
    // À ce stade : 12 valeurs distinctes dans 1..12 => l’ensemble est bien {1..12}.
    Ok(())
}

fn validate_versions(run: &RunRow) -> Result<(), ExportError> {
    let schema_ok = run.result_schema_version == EXPECTED_RESULT_SCHEMA_VERSION_V3
        || run.result_schema_version == EXPECTED_RESULT_SCHEMA_VERSION_V4
        || run.result_schema_version == EXPECTED_RESULT_SCHEMA_VERSION_V5;
    if !schema_ok {
        return Err(ExportError::SchemaNotSupported);
    }
    let contract_ok = run.calculation_contract_version
        == Some(EXPECTED_CALCULATION_CONTRACT_VERSION_V4)
        || run.calculation_contract_version == Some(EXPECTED_CALCULATION_CONTRACT_VERSION_V5)
        || run.calculation_contract_version == Some(EXPECTED_CALCULATION_CONTRACT_VERSION_V6)
        || run.calculation_contract_version == Some(EXPECTED_CALCULATION_CONTRACT_VERSION_V7);
    if !contract_ok {
        return Err(ExportError::ContractNotSupported);
    }
    if run.seniority_impact_contract_version != Some(EXPECTED_SENIORITY_IMPACT_CONTRACT_VERSION) {
        return Err(ExportError::ContractNotSupported);
    }
    if run.minimum_increase_contract_version != Some(EXPECTED_MINIMUM_INCREASE_CONTRACT_VERSION) {
        return Err(ExportError::ContractNotSupported);
    }
    Ok(())
}

/// Charge et valide le snapshot complet de la simulation `run_id`.
pub async fn load_snapshot(
    conn: &mut SqliteConnection,
    run_id: i64,
) -> Result<SimulationSnapshot, ExportError> {
    let run: Option<RunRow> =
        sqlx::query_as::<_, RunRow>("SELECT * FROM compensation_simulation_runs WHERE id = ?1")
            .bind(run_id)
            .fetch_optional(&mut *conn)
            .await?;
    let Some(run) = run else {
        return Err(ExportError::SnapshotNotFound);
    };

    validate_versions(&run)?;

    let employees: Vec<EmployeeRow> = sqlx::query_as::<_, EmployeeRow>(
        r#"
        SELECT * FROM compensation_simulation_employee_results
        WHERE simulation_run_id = ?1
        ORDER BY employee_id
        "#,
    )
    .bind(run.id)
    .fetch_all(&mut *conn)
    .await?;

    let mut employee_snapshots = Vec::with_capacity(employees.len());
    for employee in employees {
        let months: Vec<MonthRow> = sqlx::query_as::<_, MonthRow>(
            r#"
            SELECT * FROM compensation_simulation_employee_month_results
            WHERE employee_result_id = ?1
            ORDER BY month
            "#,
        )
        .bind(employee.id)
        .fetch_all(&mut *conn)
        .await?;

        let month_numbers: Vec<i64> = months.iter().map(|m| m.month).collect();
        validate_month_numbers(&month_numbers)?;

        employee_snapshots.push(EmployeeSnapshot { employee, months });
    }

    let organization: Option<OrgProfileRow> =
        sqlx::query_as::<_, OrgProfileRow>("SELECT * FROM organization_profile WHERE id = 1")
            .fetch_optional(&mut *conn)
            .await?;

    Ok(SimulationSnapshot {
        run,
        employees: employee_snapshots,
        organization,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twelve_unique_months_ok() {
        let months: Vec<i64> = (1..=12).collect();
        assert!(validate_month_numbers(&months).is_ok());
    }

    #[test]
    fn empty_months_incomplete() {
        assert!(matches!(
            validate_month_numbers(&[]),
            Err(ExportError::SnapshotIncomplete(_))
        ));
    }

    #[test]
    fn eleven_months_invalid_count() {
        let months: Vec<i64> = (1..=11).collect();
        assert!(matches!(
            validate_month_numbers(&months),
            Err(ExportError::MonthCountInvalid)
        ));
    }

    #[test]
    fn duplicate_month_detected() {
        let months = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11];
        assert!(matches!(
            validate_month_numbers(&months),
            Err(ExportError::MonthDuplicate)
        ));
    }

    #[test]
    fn out_of_range_month_invalid() {
        let months = vec![0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        assert!(matches!(
            validate_month_numbers(&months),
            Err(ExportError::MonthCountInvalid)
        ));
    }
}
