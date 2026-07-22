//! Génération du classeur XLSX RH en mémoire (Lot 2B-E1-R1).
//!
//! Cinq feuilles : `Tableau_de_bord_RH`, `Resultats_RH`, `Trajectoire_12_mois`,
//! `Synthese_campagne`, `Parametres`. Taux et statistiques en fractions
//! exactes ; conversion décimale uniquement à l’écriture Excel.

use rust_xlsxwriter::{
    Chart, ChartType, Color, Format, FormatAlign, FormatBorder, Workbook, Worksheet,
};

use super::error::ExportError;
use super::models::{EmployeeRow, MonthRow, SimulationSnapshot};
use super::numeric::{classify_canonical_integer, NumericCell};
use super::rates::{
    complement_rate, compute_rate_stats, monthly_complement_amount, parse_canonical_i128,
    position_factor_from_milli, promotion_rate, salary_ratio_from_basis_points,
    total_base_increase_rate, total_monthly_increase, ExactRate, RateDistribution,
    RATE_BUCKET_LABELS,
};
use super::sanitize::sanitize_text_cell;

pub const SHEET_DASHBOARD: &str = "Tableau_de_bord_RH";
pub const SHEET_RESULTATS: &str = "Resultats_RH";
pub const SHEET_TRAJECTOIRE: &str = "Trajectoire_12_mois";
pub const SHEET_SYNTHESE: &str = "Synthese_campagne";
pub const SHEET_PARAMETRES: &str = "Parametres";

const NON_DISPONIBLE: &str = "Non disponible";
const CONFIDENTIAL: &str = "Document confidentiel — Données salariales";
const STATS_NOTE: &str = "Statistiques hors incidence d’ancienneté";

const MONTHS_FR: [&str; 12] = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
];

/// Libellé français d’un mois 1..12 (sinon le numéro brut).
pub fn month_label_fr(month: i64) -> String {
    if (1..=12).contains(&month) {
        MONTHS_FR[(month - 1) as usize].to_string()
    } else {
        month.to_string()
    }
}

fn payment_timing_fr(code: &str) -> String {
    match code {
        "outside_campaign" => "Hors campagne",
        "reminder" => "Rappel",
        "direct" => "Direct",
        "not_applicable" => "Sans objet",
        other => other,
    }
    .to_string()
}

fn bool_fr(value: bool) -> &'static str {
    if value {
        "Oui"
    } else {
        "Non"
    }
}

fn employment_status_fr(code: &str) -> String {
    match code {
        "active" => "Actif".into(),
        "external_availability" => "Disponibilité externe".into(),
        other => other.into(),
    }
}

fn contract_type_fr(code: &str) -> String {
    match code.to_ascii_lowercase().as_str() {
        "cdi" => "CDI".into(),
        "cdd" => "CDD".into(),
        "none" => "Aucun".into(),
        other => other.to_uppercase(),
    }
}

fn promotion_status_kind_fr(code: &str) -> String {
    match code {
        "none" => "Aucun".into(),
        "included" => "Incluse".into(),
        "prior_year" => "N-1".into(),
        "excluded_after_application" => "Exclue après application".into(),
        "outside_budget_population" => "Hors population budgétaire".into(),
        other => other.into(),
    }
}

fn ineligibility_reason_fr(code: &str) -> String {
    match code {
        "ineligible_contract_type" => "Type de contrat non éligible".into(),
        "insufficient_seniority" => "Ancienneté inférieure à 12 mois au 31 décembre N-1".into(),
        "external_availability" => "Disponibilité externe".into(),
        "confirmed_underperformer" => "Sous-performant confirmé".into(),
        "explicit_exclusion" => "Exclusion explicite de la mesure".into(),
        "outside_population" => "Salarié hors population".into(),
        "CONFIRMED_UNDERPERFORMER" => "Sous-performant confirmé".into(),
        other => other.into(),
    }
}

fn nine_box_treatment_fr(kind: &str) -> String {
    match kind {
        "nine_box_code_applied" => "Code 9-Box appliqué".into(),
        "nine_box_effect_neutralized" => "Effet 9-Box neutralisé".into(),
        "missing_nine_box_data_treatment" => "Traitement des données 9-Box manquantes".into(),
        other => other.into(),
    }
}

/// Facteur d’évaluation (num/den) → décimal style position (1,000).
fn evaluation_factor_decimal(num_text: &str, den_text: &str) -> Option<f64> {
    let rate = ExactRate::from_texts(num_text, den_text)?;
    rate.to_excel_ratio()
}

fn format_date_fr(iso: &str) -> String {
    // Attend YYYY-MM-DD… → jj/mm/aaaa
    let date = iso.get(..10).unwrap_or(iso);
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() == 3 {
        format!("{}/{}/{}", parts[2], parts[1], parts[0])
    } else {
        iso.to_string()
    }
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

struct SheetFormats {
    title: Format,
    subtitle: Format,
    section: Format,
    header: Format,
    label: Format,
    money: Format,
    money_fcfa: Format,
    percent: Format,
    date: Format,
    decimal3: Format,
    note: Format,
    confidential: Format,
}

fn build_formats() -> SheetFormats {
    let header_fill = Color::RGB(0x1F4E79);
    let section_fill = Color::RGB(0xD6E3F0);
    SheetFormats {
        title: Format::new()
            .set_bold()
            .set_font_size(16)
            .set_font_color(Color::RGB(0x1F4E79)),
        subtitle: Format::new()
            .set_font_size(11)
            .set_font_color(Color::RGB(0x595959)),
        section: Format::new()
            .set_bold()
            .set_background_color(section_fill)
            .set_font_color(Color::RGB(0x1F4E79)),
        header: Format::new()
            .set_bold()
            .set_background_color(header_fill)
            .set_font_color(Color::White)
            .set_text_wrap()
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin),
        label: Format::new().set_bold(),
        money: Format::new().set_num_format("#,##0"),
        money_fcfa: Format::new().set_num_format("#,##0 \"FCFA\""),
        percent: Format::new().set_num_format("0.00%"),
        date: Format::new().set_num_format("dd/mm/yyyy"),
        decimal3: Format::new().set_num_format("0.000"),
        note: Format::new()
            .set_italic()
            .set_font_color(Color::RGB(0x595959)),
        confidential: Format::new()
            .set_italic()
            .set_font_size(9)
            .set_font_color(Color::RGB(0xC00000)),
    }
}

// ---------------------------------------------------------------------------
// Helpers d’écriture cellule
// ---------------------------------------------------------------------------

fn write_text(sheet: &mut Worksheet, row: u32, col: u16, value: &str) -> Result<(), ExportError> {
    sheet.write_string(row, col, sanitize_text_cell(value))?;
    Ok(())
}

fn write_opt_text(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<&str>,
) -> Result<(), ExportError> {
    match value {
        Some(v) => write_text(sheet, row, col, v),
        None => Ok(()),
    }
}

fn write_opt_text_na(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<&str>,
) -> Result<(), ExportError> {
    match value {
        Some(v) => write_text(sheet, row, col, v),
        None => {
            sheet.write_string(row, col, NON_DISPONIBLE)?;
            Ok(())
        }
    }
}

fn write_numeric(sheet: &mut Worksheet, row: u32, col: u16, text: &str) -> Result<(), ExportError> {
    match classify_canonical_integer(text) {
        Some(NumericCell::Number(value)) => {
            sheet.write_number(row, col, value)?;
        }
        Some(NumericCell::Text(t)) => {
            sheet.write_string(row, col, t)?;
        }
        None => {
            write_text(sheet, row, col, text)?;
        }
    }
    Ok(())
}

fn write_numeric_fmt(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    text: &str,
    fmt: &Format,
) -> Result<(), ExportError> {
    match classify_canonical_integer(text) {
        Some(NumericCell::Number(value)) => {
            sheet.write_number_with_format(row, col, value, fmt)?;
        }
        Some(NumericCell::Text(t)) => {
            sheet.write_string(row, col, t)?;
        }
        None => write_text(sheet, row, col, text)?,
    }
    Ok(())
}

fn write_opt_numeric_fmt(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<&str>,
    fmt: &Format,
) -> Result<(), ExportError> {
    match value {
        Some(v) => write_numeric_fmt(sheet, row, col, v, fmt),
        None => Ok(()),
    }
}

fn write_int(sheet: &mut Worksheet, row: u32, col: u16, value: i64) -> Result<(), ExportError> {
    sheet.write_number(row, col, value as f64)?;
    Ok(())
}

fn write_bool(sheet: &mut Worksheet, row: u32, col: u16, value: bool) -> Result<(), ExportError> {
    sheet.write_string(row, col, bool_fr(value))?;
    Ok(())
}

fn write_opt_bool(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<bool>,
) -> Result<(), ExportError> {
    match value {
        Some(v) => write_bool(sheet, row, col, v),
        None => Ok(()),
    }
}

fn write_rate(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    rate: Option<ExactRate>,
    fmt: &Format,
) -> Result<(), ExportError> {
    match rate.and_then(|r| r.to_excel_ratio()) {
        Some(ratio) => {
            sheet.write_number_with_format(row, col, ratio, fmt)?;
        }
        None => {}
    }
    Ok(())
}

fn write_i128_amount(
    sheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<i128>,
    fmt: &Format,
) -> Result<(), ExportError> {
    match value {
        Some(v) if v.abs() <= super::numeric::MAX_SAFE_INTEGER => {
            sheet.write_number_with_format(row, col, v as f64, fmt)?;
        }
        Some(v) => {
            sheet.write_string(row, col, v.to_string())?;
        }
        None => {}
    }
    Ok(())
}

fn label_text(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    value: &str,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    write_text(sheet, row, 1, value)?;
    Ok(())
}

fn label_opt_text_na(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    value: Option<&str>,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    write_opt_text_na(sheet, row, 1, value)?;
    Ok(())
}

fn label_int(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    value: i64,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    write_int(sheet, row, 1, value)?;
    Ok(())
}

fn label_opt_int(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    value: Option<i64>,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    match value {
        Some(v) => write_int(sheet, row, 1, v)?,
        None => {
            sheet.write_string(row, 1, NON_DISPONIBLE)?;
        }
    }
    Ok(())
}

fn label_numeric(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    value: &str,
    fmt: &Format,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    write_numeric_fmt(sheet, row, 1, value, fmt)?;
    Ok(())
}

fn label_opt_numeric(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    value: Option<&str>,
    fmt: &Format,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    match value {
        Some(v) => write_numeric_fmt(sheet, row, 1, v, fmt)?,
        None => {
            sheet.write_string(row, 1, NON_DISPONIBLE)?;
        }
    }
    Ok(())
}

fn label_rate(
    sheet: &mut Worksheet,
    row: u32,
    label: &str,
    bold: &Format,
    rate: Option<ExactRate>,
    fmt: &Format,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, label, bold)?;
    match rate.and_then(|r| r.to_excel_ratio()) {
        Some(ratio) => {
            sheet.write_number_with_format(row, 1, ratio, fmt)?;
        }
        None => {
            sheet.write_string(row, 1, NON_DISPONIBLE)?;
        }
    }
    Ok(())
}

fn set_capped_widths(sheet: &mut Worksheet, widths: &[(u16, f64)]) -> Result<(), ExportError> {
    for &(col, width) in widths {
        sheet.set_column_width(col, width.min(28.0))?;
    }
    Ok(())
}

fn write_confidential(sheet: &mut Worksheet, row: u32, fmt: &Format) -> Result<(), ExportError> {
    sheet.write_string_with_format(row, 0, CONFIDENTIAL, fmt)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tableau de bord RH
// ---------------------------------------------------------------------------

struct DashboardMetrics {
    total_employees: usize,
    eligible_complement: usize,
    promoted: usize,
    receiving_complement: usize,
    no_base_increase: usize,
    minimum_beneficiaries: usize,
    rates: Vec<Option<ExactRate>>,
}

fn compute_dashboard_metrics(snapshot: &SimulationSnapshot) -> DashboardMetrics {
    let mut eligible_complement = 0usize;
    let mut promoted = 0usize;
    let mut receiving_complement = 0usize;
    let mut minimum_beneficiaries = 0usize;
    let mut rates = Vec::with_capacity(snapshot.employees.len());

    for snap in &snapshot.employees {
        let e = &snap.employee;
        if e.compensatory_measure_eligible == Some(true) {
            eligible_complement += 1;
        }
        if e.has_structured_promotion == Some(true)
            || e.is_promotion_budget_population_employee == Some(true)
            || e.promotion_status_kind.as_deref() == Some("included")
        {
            promoted += 1;
        }
        let complement = monthly_complement_amount(e).unwrap_or(0);
        if complement > 0 {
            receiving_complement += 1;
        }
        if e.is_minimum_increase_population_employee == Some(true) {
            minimum_beneficiaries += 1;
        }
        rates.push(total_base_increase_rate(e));
    }

    let no_base_increase = rates
        .iter()
        .filter(|r| matches!(r, Some(rate) if rate.is_zero()))
        .count();

    DashboardMetrics {
        total_employees: snapshot.employees.len(),
        eligible_complement,
        promoted,
        receiving_complement,
        no_base_increase,
        minimum_beneficiaries,
        rates,
    }
}

fn write_dashboard(
    sheet: &mut Worksheet,
    snapshot: &SimulationSnapshot,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    let run = &snapshot.run;
    let metrics = compute_dashboard_metrics(snapshot);
    let analyzable_rates: Vec<ExactRate> = metrics.rates.iter().copied().flatten().collect();
    let stats = compute_rate_stats(&analyzable_rates);
    let distribution = RateDistribution::from_optional_rates(&metrics.rates);

    sheet.set_column_width(0, 44)?;
    sheet.set_column_width(1, 22)?;
    sheet.set_column_width(2, 28)?;
    sheet.set_column_width(3, 18)?;

    let mut row: u32 = 0;
    sheet.write_string_with_format(row, 0, "Tableau de bord RH", &formats.title)?;
    row += 1;
    let subtitle = format!(
        "Campagne « {} » — Run {} — {}",
        run.campaign_name, run.run_number, run.created_at
    );
    sheet.write_string_with_format(row, 0, &subtitle, &formats.subtitle)?;
    row += 1;
    sheet.write_string_with_format(row, 0, STATS_NOTE, &formats.note)?;
    row += 2;

    // ---- Population ----
    sheet.write_string_with_format(row, 0, "POPULATION", &formats.section)?;
    row += 1;
    label_int(
        sheet,
        row,
        "Effectif total",
        &formats.label,
        metrics.total_employees as i64,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Effectif éligible au complément",
        &formats.label,
        metrics.eligible_complement as i64,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Nombre de salariés promus",
        &formats.label,
        metrics.promoted as i64,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Nombre de salariés recevant un complément",
        &formats.label,
        metrics.receiving_complement as i64,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Nombre de salariés sans augmentation de base",
        &formats.label,
        metrics.no_base_increase as i64,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Nombre de salariés bénéficiant du minimum garanti",
        &formats.label,
        metrics.minimum_beneficiaries as i64,
    )?;
    row += 1;
    let neutralized_count = run.neutralize_nine_box_effect_employee_count.or_else(|| {
        let any_v4 = snapshot
            .employees
            .iter()
            .any(|e| e.employee.neutralize_nine_box_effect.is_some());
        if !any_v4 {
            return None;
        }
        Some(
            snapshot
                .employees
                .iter()
                .filter(|e| e.employee.neutralize_nine_box_effect == Some(true))
                .count() as i64,
        )
    });
    label_opt_int(
        sheet,
        row,
        "Salariés avec effet 9-Box neutralisé",
        &formats.label,
        neutralized_count,
    )?;
    row += 2;

    // ---- Taux ----
    sheet.write_string_with_format(
        row,
        0,
        "TAUX TOTAL D’AUGMENTATION DE BASE",
        &formats.section,
    )?;
    row += 1;
    match &stats {
        Some(s) => {
            label_rate(
                sheet,
                row,
                "Taux minimum",
                &formats.label,
                Some(s.min),
                &formats.percent,
            )?;
            row += 1;
            label_rate(
                sheet,
                row,
                "Taux maximum",
                &formats.label,
                Some(s.max),
                &formats.percent,
            )?;
            row += 1;
            label_rate(
                sheet,
                row,
                "Taux moyen",
                &formats.label,
                Some(s.mean),
                &formats.percent,
            )?;
            row += 1;
            label_rate(
                sheet,
                row,
                "Taux médian",
                &formats.label,
                Some(s.median),
                &formats.percent,
            )?;
            row += 1;
        }
        None => {
            label_opt_text_na(sheet, row, "Taux minimum", &formats.label, None)?;
            row += 1;
            label_opt_text_na(sheet, row, "Taux maximum", &formats.label, None)?;
            row += 1;
            label_opt_text_na(sheet, row, "Taux moyen", &formats.label, None)?;
            row += 1;
            label_opt_text_na(sheet, row, "Taux médian", &formats.label, None)?;
            row += 1;
        }
    }
    row += 1;

    // ---- Budget ----
    sheet.write_string_with_format(row, 0, "BUDGET", &formats.section)?;
    row += 1;
    // Budget de période : numérateur cible si den=1, sinon fraction affichée en num.
    label_numeric(
        sheet,
        row,
        "Budget de période",
        &formats.label,
        &run.budget_target_numerator_text,
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût des promotions sur la période",
        &formats.label,
        run.promotion_campaign_period_budget_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût du minimum garanti sur la période",
        &formats.label,
        run.actual_minimum_complement_paid_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût au-dessus du minimum sur la période",
        &formats.label,
        run.actual_compensation_above_minimum_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût compensatoire total sur la période",
        &formats.label,
        run.actual_compensatory_campaign_period_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût total combiné sur la période",
        &formats.label,
        run.actual_combined_campaign_period_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;

    // Delta budgétaire = budget − coût compensatoire (si les deux sont des entiers).
    let delta = match (
        parse_canonical_i128(&run.budget_target_numerator_text),
        parse_canonical_i128(&run.budget_target_denominator_text),
        run.actual_compensatory_campaign_period_cost_text
            .as_deref()
            .and_then(parse_canonical_i128),
    ) {
        (Some(budget_num), Some(1), Some(cost)) => Some(budget_num - cost),
        _ => None,
    };
    sheet.write_string_with_format(row, 0, "Delta budgétaire", &formats.label)?;
    match delta {
        Some(v) if v.abs() <= super::numeric::MAX_SAFE_INTEGER => {
            sheet.write_number_with_format(row, 1, v as f64, &formats.money_fcfa)?;
        }
        Some(v) => {
            sheet.write_string(row, 1, v.to_string())?;
        }
        None => {
            sheet.write_string(row, 1, NON_DISPONIBLE)?;
        }
    }
    row += 1;

    let beneficiary_count = snapshot
        .employees
        .iter()
        .filter(|s| {
            let e = &s.employee;
            let promo = e
                .promotion_amount_text
                .as_deref()
                .and_then(parse_canonical_i128)
                .unwrap_or(0);
            let compl = monthly_complement_amount(e).unwrap_or(0);
            promo > 0 || compl > 0
        })
        .count();
    sheet.write_string_with_format(
        row,
        0,
        "Coût moyen par salarié bénéficiaire",
        &formats.label,
    )?;
    match (
        run.actual_combined_campaign_period_cost_text
            .as_deref()
            .or(run.actual_compensatory_campaign_period_cost_text.as_deref())
            .and_then(parse_canonical_i128),
        beneficiary_count,
    ) {
        (Some(cost), n) if n > 0 => {
            let avg = cost / (n as i128);
            if avg.abs() <= super::numeric::MAX_SAFE_INTEGER {
                sheet.write_number_with_format(row, 1, avg as f64, &formats.money_fcfa)?;
            } else {
                sheet.write_string(row, 1, avg.to_string())?;
            }
        }
        _ => {
            sheet.write_string(row, 1, NON_DISPONIBLE)?;
        }
    }
    row += 2;

    // ---- Distribution ----
    sheet.write_string_with_format(
        row,
        0,
        "DISTRIBUTION DES TAUX D’AUGMENTATION",
        &formats.section,
    )?;
    row += 1;
    let dist_header_row = row;
    sheet.write_string_with_format(row, 0, "Tranche", &formats.header)?;
    sheet.write_string_with_format(row, 1, "Effectif", &formats.header)?;
    sheet.write_string_with_format(row, 2, "Part de l’effectif analysable (%)", &formats.header)?;
    row += 1;
    let dist_first_data = row;
    for (i, label) in RATE_BUCKET_LABELS.iter().enumerate() {
        sheet.write_string(row, 0, *label)?;
        sheet.write_number(row, 1, distribution.counts[i] as f64)?;
        match distribution
            .share_of_analyzable(i)
            .and_then(|r| r.to_excel_ratio())
        {
            Some(ratio) => {
                sheet.write_number_with_format(row, 2, ratio, &formats.percent)?;
            }
            None => {
                sheet.write_string(row, 2, NON_DISPONIBLE)?;
            }
        }
        row += 1;
    }
    let dist_last_data = row - 1;
    row += 1;
    sheet.write_string_with_format(
        row,
        0,
        &format!(
            "Taux non calculable : {} salarié{}",
            distribution.non_calculable,
            if distribution.non_calculable > 1 {
                "s"
            } else {
                ""
            }
        ),
        &formats.note,
    )?;
    row += 2;

    // Histogramme (référence les données de la table, pas de formule métier).
    let mut column_chart = Chart::new(ChartType::Column);
    column_chart
        .title()
        .set_name("Effectifs par tranche de taux d’augmentation");
    column_chart.legend().set_hidden();
    column_chart
        .add_series()
        .set_categories((SHEET_DASHBOARD, dist_first_data, 0, dist_last_data, 0))
        .set_values((SHEET_DASHBOARD, dist_first_data, 1, dist_last_data, 1))
        .set_name("Effectif");
    sheet.insert_chart(dist_header_row, 4, &column_chart)?;

    // Graphique circulaire P2 — répartition des coûts (si données présentes).
    let promo_cost = run
        .promotion_campaign_period_budget_cost_text
        .as_deref()
        .and_then(parse_canonical_i128);
    let min_cost = run
        .actual_minimum_complement_paid_cost_text
        .as_deref()
        .and_then(parse_canonical_i128);
    let above_cost = run
        .actual_compensation_above_minimum_cost_text
        .as_deref()
        .and_then(parse_canonical_i128);

    if promo_cost.is_some() || min_cost.is_some() || above_cost.is_some() {
        sheet.write_string_with_format(row, 0, "RÉPARTITION DE L’ENVELOPPE", &formats.section)?;
        row += 1;
        let pie_header = row;
        sheet.write_string_with_format(row, 0, "Poste", &formats.header)?;
        sheet.write_string_with_format(row, 1, "Montant", &formats.header)?;
        row += 1;
        let pie_first = row;
        sheet.write_string(row, 0, "Promotions")?;
        write_i128_amount(sheet, row, 1, promo_cost.or(Some(0)), &formats.money)?;
        row += 1;
        sheet.write_string(row, 0, "Minimum garanti")?;
        write_i128_amount(sheet, row, 1, min_cost.or(Some(0)), &formats.money)?;
        row += 1;
        sheet.write_string(row, 0, "Au-dessus du minimum")?;
        write_i128_amount(sheet, row, 1, above_cost.or(Some(0)), &formats.money)?;
        let pie_last = row;
        row += 2;

        let mut pie = Chart::new(ChartType::Doughnut);
        pie.title()
            .set_name("Répartition de l’enveloppe d’augmentation");
        pie.add_series()
            .set_categories((SHEET_DASHBOARD, pie_first, 0, pie_last, 0))
            .set_values((SHEET_DASHBOARD, pie_first, 1, pie_last, 1));
        sheet.insert_chart(pie_header, 4, &pie)?;
    }

    write_confidential(sheet, row, &formats.confidential)?;
    let _ = dist_header_row;
    Ok(())
}

// ---------------------------------------------------------------------------
// Résultats RH
// ---------------------------------------------------------------------------

const RESULTATS_HEADERS: &[&str] = &[
    // BLOC 1 — IDENTITÉ
    "Matricule",
    "Nom complet",
    "Date d’embauche",
    "Type de contrat",
    "Statut",
    // BLOC 2 — POSITIONNEMENT INITIAL
    "Famille d’emploi",
    "Grade",
    "Salaire de base décembre N-1",
    "Salaire de référence",
    "Position salariale",
    "Positionnement par rapport à S0 (%)",
    // BLOC 3 — ÉLIGIBILITÉ
    "Éligible au complément",
    "Motif d’inéligibilité",
    "Population minimum",
    "Sous-performance confirmée",
    "Effet 9-Box neutralisé",
    "Code 9-Box source",
    "Facteur 9-Box effectif",
    "Traitement 9-Box appliqué",
    // BLOC 4 — PROMOTION
    "Date de promotion",
    "Grade après promotion",
    "Salaire avant promotion",
    "Salaire après promotion",
    "Montant mensuel de promotion",
    "Taux de promotion (%)",
    "Promotion incluse",
    "Coût des promotions sur la période",
    // BLOC 5 — MINIMUM ET COMPLÉMENT
    "Minimum garanti mensuel",
    "Complément au-dessus du minimum",
    "Complément mensuel total",
    "Taux de complément (%)",
    // BLOC 6 — RÉSULTAT FINAL
    "Augmentation mensuelle totale",
    "Taux total d’augmentation de base (%)",
    "Salaire mensuel final",
    "Coût compensatoire sur la période",
    "Coût total sur la période",
    // BLOC 7 — PAIEMENT
    "Rappel total",
    "Paiement direct total",
    // BLOC 8 — ANCIENNETÉ
    "Incidence ancienneté promotion",
    "Incidence ancienneté complément",
    "Incidence ancienneté totale sur la période",
    // BLOC 9 — PLEIN EFFET
    "Promotion plein effet 12 mois",
    "Complément plein effet 12 mois",
    "Mesure totale plein effet 12 mois",
    "Ancienneté plein effet 12 mois",
    // Techniques (fin de feuille)
    "Facteur de position",
    "Taux théorique (num)",
    "Taux théorique (den)",
];

fn write_resultats(
    sheet: &mut Worksheet,
    snapshot: &SimulationSnapshot,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(0, 0, "Résultats RH par salarié", &formats.title)?;
    sheet.write_string_with_format(1, 0, CONFIDENTIAL, &formats.confidential)?;

    let header_row = 3u32;
    for (col, header) in RESULTATS_HEADERS.iter().enumerate() {
        sheet.write_string_with_format(header_row, col as u16, *header, &formats.header)?;
    }
    sheet.set_row_height(header_row, 36)?;

    for (index, snap) in snapshot.employees.iter().enumerate() {
        let row = header_row + 1 + (index as u32);
        write_employee_row(sheet, row, &snap.employee, formats)?;
    }

    let last_row = header_row + snapshot.employees.len() as u32;
    let last_col = (RESULTATS_HEADERS.len() - 1) as u16;
    if !snapshot.employees.is_empty() {
        sheet.autofilter(header_row, 0, last_row, last_col)?;
    }
    sheet.set_freeze_panes(header_row + 1, 2)?;

    // Largeurs plafonnées
    let widths: Vec<(u16, f64)> = (0..RESULTATS_HEADERS.len() as u16)
        .map(|c| {
            let w = match c {
                0 => 14.0,
                1 => 22.0,
                2 | 15 => 14.0,
                _ => 16.0,
            };
            (c, w)
        })
        .collect();
    set_capped_widths(sheet, &widths)?;
    Ok(())
}

fn write_employee_row(
    sheet: &mut Worksheet,
    row: u32,
    e: &EmployeeRow,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    let mut c: u16 = 0;
    // Identité
    write_text(sheet, row, c, &e.employee_id)?;
    c += 1;
    write_opt_text(sheet, row, c, e.employee_display_name.as_deref())?;
    c += 1;
    match e.hire_date.as_deref() {
        Some(d) => write_text(sheet, row, c, &format_date_fr(d))?,
        None => {}
    }
    c += 1;
    match e.contract_type.as_deref() {
        Some(ct) => write_text(sheet, row, c, &contract_type_fr(ct))?,
        None => {}
    }
    c += 1;
    match e.employment_status.as_deref() {
        Some(st) => write_text(sheet, row, c, &employment_status_fr(st))?,
        None => {}
    }
    c += 1;

    // Positionnement
    write_opt_text(
        sheet,
        row,
        c,
        e.family_label.as_deref().or(Some(e.family_code.as_str())),
    )?;
    c += 1;
    write_opt_text(
        sheet,
        row,
        c,
        e.grade_label.as_deref().or(Some(e.grade_code.as_str())),
    )?;
    c += 1;
    write_numeric_fmt(sheet, row, c, &e.salary_fcfa_text, &formats.money)?;
    c += 1;
    write_numeric_fmt(sheet, row, c, &e.s0_fcfa_text, &formats.money)?;
    c += 1;
    write_text(sheet, row, c, &e.salary_position_label)?;
    c += 1;
    sheet.write_number_with_format(
        row,
        c,
        salary_ratio_from_basis_points(e.salary_ratio_basis_points),
        &formats.percent,
    )?;
    c += 1;

    // Éligibilité
    write_opt_bool(sheet, row, c, e.compensatory_measure_eligible)?;
    c += 1;
    let motif = e
        .compensatory_ineligibility_reason_code
        .as_deref()
        .or(e.blocking_reason.as_deref());
    match motif {
        Some(code) => write_text(sheet, row, c, &ineligibility_reason_fr(code))?,
        None => {}
    }
    c += 1;
    write_opt_bool(sheet, row, c, e.is_minimum_increase_population_employee)?;
    c += 1;
    let underperformer = e.blocking_reason.as_deref() == Some("CONFIRMED_UNDERPERFORMER")
        || e.compensatory_ineligibility_reason_code.as_deref() == Some("confirmed_underperformer")
        || e.compensatory_eligibility_kind.as_deref() == Some("confirmed_underperformer");
    write_bool(sheet, row, c, underperformer)?;
    c += 1;

    // 9-Box / neutralisation (schema v4 — NULL historiques = vide, jamais faux Non)
    match e.neutralize_nine_box_effect {
        Some(v) => write_bool(sheet, row, c, v)?,
        None => {}
    }
    c += 1;
    match e.source_nine_box_code {
        Some(code) => write_int(sheet, row, c, code)?,
        None => {}
    }
    c += 1;
    match evaluation_factor_decimal(
        &e.evaluation_factor_numerator_text,
        &e.evaluation_factor_denominator_text,
    ) {
        Some(factor) => {
            sheet.write_number_with_format(row, c, factor, &formats.decimal3)?;
        }
        None => {}
    }
    c += 1;
    match e.nine_box_treatment_kind.as_deref() {
        Some(kind) => write_text(sheet, row, c, &nine_box_treatment_fr(kind))?,
        None => {}
    }
    c += 1;

    // Promotion
    match e.promotion_date.as_deref() {
        Some(d) => write_text(sheet, row, c, &format_date_fr(d))?,
        None => {}
    }
    c += 1;
    write_opt_text(sheet, row, c, e.promoted_grade_code.as_deref())?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.salary_before_promotion_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.salary_after_promotion_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.promotion_amount_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_rate(sheet, row, c, promotion_rate(e), &formats.percent)?;
    c += 1;
    let included = e.is_promotion_budget_population_employee.or_else(|| {
        e.promotion_status_kind
            .as_deref()
            .map(|k| k == "included")
            .or(e.has_structured_promotion)
    });
    match included {
        Some(v) => write_bool(sheet, row, c, v)?,
        None => {
            if let Some(kind) = e.promotion_status_kind.as_deref() {
                write_text(sheet, row, c, &promotion_status_kind_fr(kind))?;
            }
        }
    }
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.annual_promotion_budget_cost_text.as_deref(),
        &formats.money,
    )?;
    c += 1;

    // Minimum et complément
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.campaign_period_minimum_complement_floor_cost_text
            .as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.campaign_period_compensation_above_minimum_cost_text
            .as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_i128_amount(sheet, row, c, monthly_complement_amount(e), &formats.money)?;
    c += 1;
    write_rate(sheet, row, c, complement_rate(e), &formats.percent)?;
    c += 1;

    // Résultat final
    write_i128_amount(sheet, row, c, total_monthly_increase(e), &formats.money)?;
    c += 1;
    write_rate(sheet, row, c, total_base_increase_rate(e), &formats.percent)?;
    c += 1;
    write_numeric_fmt(sheet, row, c, &e.final_salary_fcfa_text, &formats.money)?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.annual_actual_cost_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.combined_annual_actual_cost_text.as_deref(),
        &formats.money,
    )?;
    c += 1;

    // Paiement
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.base_salary_reminder_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.remaining_year_direct_increase_cost_text.as_deref(),
        &formats.money,
    )?;
    c += 1;

    // Ancienneté
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.annual_promotion_seniority_impact_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    // Incidence complément ≈ total − promotion si les deux existent, sinon total.
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.annual_seniority_impact_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.combined_annual_seniority_impact_text
            .as_deref()
            .or(e.annual_seniority_impact_text.as_deref()),
        &formats.money,
    )?;
    c += 1;

    // Plein effet
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.full_year_run_rate_promotion_cost_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.full_year_run_rate_compensatory_cost_text.as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.full_year_run_rate_combined_base_measure_cost_text
            .as_deref(),
        &formats.money,
    )?;
    c += 1;
    write_opt_numeric_fmt(
        sheet,
        row,
        c,
        e.full_year_run_rate_seniority_impact_text.as_deref(),
        &formats.money,
    )?;
    c += 1;

    // Techniques
    sheet.write_number_with_format(
        row,
        c,
        position_factor_from_milli(e.position_factor_milli),
        &formats.decimal3,
    )?;
    c += 1;
    write_numeric(sheet, row, c, &e.theoretical_increase_rate_numerator_text)?;
    c += 1;
    write_numeric(sheet, row, c, &e.theoretical_increase_rate_denominator_text)?;

    let _ = formats.date;
    Ok(())
}

// ---------------------------------------------------------------------------
// Trajectoire 12 mois
// ---------------------------------------------------------------------------

const TRAJECTOIRE_HEADERS: &[&str] = &[
    // Identité
    "Matricule",
    "Nom complet",
    // Calendrier
    "Mois (n°)",
    "Mois",
    // Salaire de base
    "Salaire de base",
    "Grade",
    "Famille",
    "Position salariale",
    // Promotion
    "Coût budget promotion",
    "Promotion active",
    "Statut de promotion",
    // Minimum et complément
    "Minimum garanti mensuel",
    "Complément au-dessus du minimum",
    "Complément compensatoire arrondi",
    "Taux cible total (%)",
    "Taux de complément (%)",
    // Salaire final
    "Salaire final",
    // Ancienneté
    "Taux d’ancienneté (%)",
    "Incidence ancienneté promotion",
    "Incidence ancienneté complément",
    "Incidence ancienneté totale",
    // Timing de paiement
    "Calendrier de paiement",
    "Calendrier de promotion",
    "Couvert par la période",
    "Inclus dans l’enveloppe",
    // Techniques (fin)
    "Taux cible total (num)",
    "Taux cible total (den)",
    "Taux complément (num)",
    "Taux complément (den)",
];

fn write_trajectoire(
    sheet: &mut Worksheet,
    snapshot: &SimulationSnapshot,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    sheet.write_string_with_format(0, 0, "Trajectoire sur 12 mois", &formats.title)?;
    sheet.write_string_with_format(1, 0, CONFIDENTIAL, &formats.confidential)?;

    let header_row = 3u32;
    for (col, header) in TRAJECTOIRE_HEADERS.iter().enumerate() {
        sheet.write_string_with_format(header_row, col as u16, *header, &formats.header)?;
    }
    sheet.set_row_height(header_row, 36)?;

    let mut row: u32 = header_row + 1;
    for snap in &snapshot.employees {
        let employee_id = &snap.employee.employee_id;
        let display_name = snap.employee.employee_display_name.as_deref();
        for month in &snap.months {
            write_month_row(sheet, row, employee_id, display_name, month, formats)?;
            row += 1;
        }
    }

    let last_row = header_row + snapshot.month_row_count() as u32;
    let last_col = (TRAJECTOIRE_HEADERS.len() - 1) as u16;
    if snapshot.month_row_count() > 0 {
        sheet.autofilter(header_row, 0, last_row, last_col)?;
    }
    sheet.set_freeze_panes(header_row + 1, 2)?;

    let widths: Vec<(u16, f64)> = (0..TRAJECTOIRE_HEADERS.len() as u16)
        .map(|c| (c, if c <= 1 { 18.0 } else { 14.0 }))
        .collect();
    set_capped_widths(sheet, &widths)?;
    Ok(())
}

fn write_month_row(
    sheet: &mut Worksheet,
    row: u32,
    employee_id: &str,
    display_name: Option<&str>,
    m: &MonthRow,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    let mut c: u16 = 0;
    write_text(sheet, row, c, employee_id)?;
    c += 1;
    write_opt_text(sheet, row, c, display_name)?;
    c += 1;
    write_int(sheet, row, c, m.month)?;
    c += 1;
    write_text(sheet, row, c, &month_label_fr(m.month))?;
    c += 1;
    write_numeric_fmt(sheet, row, c, &m.base_salary_fcfa_text, &formats.money)?;
    c += 1;
    write_text(sheet, row, c, &m.grade_code)?;
    c += 1;
    write_text(sheet, row, c, &m.job_family_code)?;
    c += 1;
    write_opt_text(sheet, row, c, m.salary_position_label.as_deref())?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.promotion_budget_cost_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_bool(sheet, row, c, m.promotion_active)?;
    c += 1;
    let status = if m.promotion_status == "none" {
        "Aucun".to_string()
    } else {
        m.promotion_status.clone()
    };
    write_text(sheet, row, c, &status)?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.minimum_complement_floor_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.actual_complement_above_minimum_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.rounded_compensatory_complement_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_rate(
        sheet,
        row,
        c,
        ExactRate::from_texts(
            &m.target_compensatory_rate_num_text,
            &m.target_compensatory_rate_den_text,
        ),
        &formats.percent,
    )?;
    c += 1;
    write_rate(
        sheet,
        row,
        c,
        ExactRate::from_texts(
            &m.compensatory_complement_rate_num_text,
            &m.compensatory_complement_rate_den_text,
        ),
        &formats.percent,
    )?;
    c += 1;
    write_numeric_fmt(sheet, row, c, &m.final_salary_fcfa_text, &formats.money)?;
    c += 1;
    // Taux ancienneté déjà en points de pourcentage entiers → ratio Excel.
    sheet.write_number_with_format(
        row,
        c,
        (m.seniority_rate_percent as f64) / 100.0,
        &formats.percent,
    )?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.promotion_seniority_impact_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.compensatory_seniority_impact_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_numeric_fmt(
        sheet,
        row,
        c,
        &m.total_seniority_impact_fcfa_text,
        &formats.money,
    )?;
    c += 1;
    write_text(sheet, row, c, &payment_timing_fr(&m.payment_timing))?;
    c += 1;
    write_text(
        sheet,
        row,
        c,
        &payment_timing_fr(&m.promotion_payment_timing),
    )?;
    c += 1;
    write_bool(sheet, row, c, m.covered_by_campaign_period)?;
    c += 1;
    write_bool(sheet, row, c, m.included_in_campaign_envelope)?;
    c += 1;
    // Techniques
    write_numeric(sheet, row, c, &m.target_compensatory_rate_num_text)?;
    c += 1;
    write_numeric(sheet, row, c, &m.target_compensatory_rate_den_text)?;
    c += 1;
    write_numeric(sheet, row, c, &m.compensatory_complement_rate_num_text)?;
    c += 1;
    write_numeric(sheet, row, c, &m.compensatory_complement_rate_den_text)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Synthèse & Paramètres
// ---------------------------------------------------------------------------

fn write_synthese(
    sheet: &mut Worksheet,
    snapshot: &SimulationSnapshot,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    let run = &snapshot.run;
    let org = snapshot.organization.as_ref();
    sheet.set_column_width(0, 44)?;
    sheet.set_column_width(1, 32)?;

    let mut row: u32 = 0;
    sheet.write_string_with_format(row, 0, "Synthèse de campagne", &formats.title)?;
    row += 1;
    write_confidential(sheet, row, &formats.confidential)?;
    row += 2;

    sheet.write_string_with_format(row, 0, "IDENTITÉ", &formats.section)?;
    row += 1;
    label_opt_text_na(
        sheet,
        row,
        "Organisation",
        &formats.label,
        org.map(|o| o.organization_name.as_str()),
    )?;
    row += 1;
    label_opt_text_na(
        sheet,
        row,
        "Produit",
        &formats.label,
        org.map(|o| o.product_name.as_str()),
    )?;
    row += 1;
    label_text(sheet, row, "Campagne", &formats.label, &run.campaign_name)?;
    row += 1;
    label_int(
        sheet,
        row,
        "Année de campagne",
        &formats.label,
        run.campaign_year,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Numéro d’exécution",
        &formats.label,
        run.run_number,
    )?;
    row += 1;
    label_text(
        sheet,
        row,
        "Statut à l’exécution",
        &formats.label,
        &run.campaign_status_at_run,
    )?;
    row += 1;
    label_text(
        sheet,
        row,
        "Mode d’évaluation",
        &formats.label,
        &run.evaluation_mode,
    )?;
    row += 1;
    label_opt_text_na(
        sheet,
        row,
        "Fichier source",
        &formats.label,
        run.source_import_file_name.as_deref(),
    )?;
    row += 1;
    label_text(
        sheet,
        row,
        "Date de génération",
        &formats.label,
        &run.created_at,
    )?;
    row += 2;

    sheet.write_string_with_format(row, 0, "POPULATION", &formats.section)?;
    row += 1;
    label_int(sheet, row, "Effectif", &formats.label, run.employee_count)?;
    row += 1;
    label_int(
        sheet,
        row,
        "Salariés à poids positif",
        &formats.label,
        run.positive_weight_employee_count,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Salariés à poids nul",
        &formats.label,
        run.zero_weight_employee_count,
    )?;
    row += 1;
    label_int(
        sheet,
        row,
        "Sous-performeurs confirmés",
        &formats.label,
        run.confirmed_underperformer_count,
    )?;
    row += 1;
    let neutralized_count = run.neutralize_nine_box_effect_employee_count.or_else(|| {
        let count = snapshot
            .employees
            .iter()
            .filter(|e| e.employee.neutralize_nine_box_effect == Some(true))
            .count() as i64;
        // Ne reconstruire un compteur que si au moins un salarié a l’info v4.
        let any_v4 = snapshot
            .employees
            .iter()
            .any(|e| e.employee.neutralize_nine_box_effect.is_some());
        if any_v4 {
            Some(count)
        } else {
            None
        }
    });
    label_opt_int(
        sheet,
        row,
        "Salariés avec effet 9-Box neutralisé",
        &formats.label,
        neutralized_count,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Population minimum garanti",
        &formats.label,
        run.minimum_increase_population_employee_count,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Salariés promus inclus",
        &formats.label,
        run.promoted_included_employee_count,
    )?;
    row += 2;

    sheet.write_string_with_format(row, 0, "COÛTS SUR LA PÉRIODE", &formats.section)?;
    row += 1;
    // Un seul indicateur principal (suppression du doublon « coût effectif »).
    label_opt_numeric(
        sheet,
        row,
        "Coût compensatoire sur la période",
        &formats.label,
        run.actual_compensatory_campaign_period_cost_text
            .as_deref()
            .or(Some(run.actual_operation_amount_fcfa_text.as_str())),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût total sur la période",
        &formats.label,
        run.actual_combined_campaign_period_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût du minimum garanti sur la période",
        &formats.label,
        run.actual_minimum_complement_paid_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût au-dessus du minimum sur la période",
        &formats.label,
        run.actual_compensation_above_minimum_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Coût des promotions sur la période",
        &formats.label,
        run.promotion_campaign_period_budget_cost_text
            .as_deref()
            .or(run.total_annual_promotion_budget_cost_text.as_deref()),
        &formats.money_fcfa,
    )?;
    row += 2;

    sheet.write_string_with_format(row, 0, "PLEIN EFFET SUR 12 MOIS", &formats.section)?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Mesure totale plein effet 12 mois",
        &formats.label,
        run.full_year_run_rate_combined_base_measure_cost_text
            .as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Promotion plein effet 12 mois",
        &formats.label,
        run.full_year_run_rate_promotion_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Complément plein effet 12 mois",
        &formats.label,
        run.full_year_run_rate_compensatory_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Ancienneté plein effet 12 mois",
        &formats.label,
        run.full_year_run_rate_seniority_impact_text.as_deref(),
        &formats.money_fcfa,
    )?;

    Ok(())
}

fn write_parametres(
    sheet: &mut Worksheet,
    snapshot: &SimulationSnapshot,
    formats: &SheetFormats,
) -> Result<(), ExportError> {
    let run = &snapshot.run;
    let org = snapshot.organization.as_ref();
    sheet.set_column_width(0, 46)?;
    sheet.set_column_width(1, 40)?;

    let mut row: u32 = 0;
    sheet.write_string_with_format(row, 0, "Paramètres de la simulation", &formats.title)?;
    row += 1;
    write_confidential(sheet, row, &formats.confidential)?;
    row += 2;

    sheet.write_string_with_format(row, 0, "BUDGET ET ARRONDI", &formats.section)?;
    row += 1;
    label_text(
        sheet,
        row,
        "Mode de budget cible",
        &formats.label,
        &run.budget_target_mode,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Budget manuel (FCFA)",
        &formats.label,
        run.manual_budget_fcfa_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Masse salariale éligible (FCFA)",
        &formats.label,
        run.eligible_payroll_fcfa_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Taux de budget (points de base)",
        &formats.label,
        run.budget_rate_basis_points,
    )?;
    row += 1;
    label_numeric(
        sheet,
        row,
        "Cible budgétaire (numérateur)",
        &formats.label,
        &run.budget_target_numerator_text,
        &formats.money,
    )?;
    row += 1;
    label_numeric(
        sheet,
        row,
        "Cible budgétaire (dénominateur)",
        &formats.label,
        &run.budget_target_denominator_text,
        &formats.money,
    )?;
    row += 1;
    label_text(
        sheet,
        row,
        "Mode d’arrondi",
        &formats.label,
        &run.rounding_mode,
    )?;
    row += 1;
    label_numeric(
        sheet,
        row,
        "Pas d’arrondi (FCFA)",
        &formats.label,
        &run.rounding_step_fcfa_text,
        &formats.money,
    )?;
    row += 2;

    sheet.write_string_with_format(row, 0, "CONTRATS ET CALENDRIER", &formats.section)?;
    row += 1;
    label_int(
        sheet,
        row,
        "Version du schéma de résultat",
        &formats.label,
        run.result_schema_version,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Version du contrat de calcul",
        &formats.label,
        run.calculation_contract_version,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Version du contrat d’ancienneté",
        &formats.label,
        run.seniority_impact_contract_version,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Version du contrat de minimum garanti",
        &formats.label,
        run.minimum_increase_contract_version,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Mois de début de rétroactivité",
        &formats.label,
        run.retroactivity_start_month,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Mois d’application technique",
        &formats.label,
        run.technical_application_month,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Mois couverts par la campagne",
        &formats.label,
        run.campaign_covered_month_count,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Mois de rappel",
        &formats.label,
        run.reminder_month_count,
    )?;
    row += 1;
    label_opt_int(
        sheet,
        row,
        "Mois de paiement direct",
        &formats.label,
        run.direct_payment_month_count,
    )?;
    row += 2;

    sheet.write_string_with_format(row, 0, "MINIMUM GARANTI", &formats.section)?;
    row += 1;
    label_opt_text_na(
        sheet,
        row,
        "Mode de minimum garanti",
        &formats.label,
        run.minimum_increase_mode.as_deref(),
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Montant minimum mensuel (FCFA)",
        &formats.label,
        run.minimum_monthly_amount_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Taux minimum (numérateur) — audit",
        &formats.label,
        run.minimum_rate_num_text.as_deref(),
        &formats.money,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Taux minimum (dénominateur) — audit",
        &formats.label,
        run.minimum_rate_den_text.as_deref(),
        &formats.money,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Total plancher minimum garanti (FCFA)",
        &formats.label,
        run.total_minimum_complement_floor_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 1;
    label_opt_numeric(
        sheet,
        row,
        "Budget promotion période (FCFA)",
        &formats.label,
        run.promotion_campaign_period_budget_cost_text.as_deref(),
        &formats.money_fcfa,
    )?;
    row += 2;

    sheet.write_string_with_format(row, 0, "EMPREINTES", &formats.section)?;
    row += 1;
    label_text(
        sheet,
        row,
        "Empreinte source",
        &formats.label,
        &run.source_fingerprint,
    )?;
    row += 1;
    label_text(
        sheet,
        row,
        "Empreinte de configuration",
        &formats.label,
        &run.configuration_fingerprint,
    )?;
    row += 1;
    label_opt_text_na(
        sheet,
        row,
        "Pied de page du rapport",
        &formats.label,
        org.map(|o| o.report_footer.as_str()),
    )?;

    Ok(())
}

/// Construit le classeur XLSX complet en mémoire (buffer OOXML non chiffré).
pub fn build_workbook(snapshot: &SimulationSnapshot) -> Result<Vec<u8>, ExportError> {
    let mut workbook = Workbook::new();
    let formats = build_formats();

    {
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_DASHBOARD)?;
        write_dashboard(sheet, snapshot, &formats)?;
    }
    {
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_RESULTATS)?;
        write_resultats(sheet, snapshot, &formats)?;
    }
    {
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_TRAJECTOIRE)?;
        write_trajectoire(sheet, snapshot, &formats)?;
    }
    {
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_SYNTHESE)?;
        write_synthese(sheet, snapshot, &formats)?;
    }
    {
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_PARAMETRES)?;
        write_parametres(sheet, snapshot, &formats)?;
    }

    let buffer = workbook.save_to_buffer()?;
    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::super::rates::{classify_rate_bucket, ExactRate, RateBucket};
    use super::*;

    #[test]
    fn french_month_labels() {
        assert_eq!(month_label_fr(1), "Janvier");
        assert_eq!(month_label_fr(8), "Août");
        assert_eq!(month_label_fr(12), "Décembre");
    }

    #[test]
    fn bool_labels_are_oui_non() {
        assert_eq!(bool_fr(true), "Oui");
        assert_eq!(bool_fr(false), "Non");
    }

    #[test]
    fn status_translations() {
        assert_eq!(employment_status_fr("active"), "Actif");
        assert_eq!(contract_type_fr("cdi"), "CDI");
        assert_eq!(contract_type_fr("cdd"), "CDD");
        assert_eq!(promotion_status_kind_fr("none"), "Aucun");
    }

    #[test]
    fn bucket_helper_reexported_for_sheet_order() {
        assert_eq!(
            classify_rate_bucket(ExactRate::zero()),
            RateBucket::ExactZero
        );
    }
}
