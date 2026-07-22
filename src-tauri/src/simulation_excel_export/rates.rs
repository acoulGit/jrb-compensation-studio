//! Taux RH exacts (fractions) pour l’export Excel (Lot 2B-E1-R1).
//!
//! Tous les calculs de taux, statistiques et tranches restent en arithmétique
//! rationnelle exacte (`i128`). La conversion en `f64` n’intervient qu’à
//! l’écriture Excel (affichage 0,00 %). Aucun zéro fabriqué : dénominateur
//! NULL / nul / invalide → taux absent.

use super::models::EmployeeRow;
use super::numeric::is_canonical_integer_text;

/// Fraction exacte normalisée (dénominateur > 0).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExactRate {
    pub numerator: i128,
    pub denominator: i128,
}

impl ExactRate {
    pub fn new(numerator: i128, denominator: i128) -> Option<Self> {
        if denominator == 0 {
            return None;
        }
        let (n, d) = if denominator < 0 {
            (-numerator, -denominator)
        } else {
            (numerator, denominator)
        };
        let g = gcd(n.abs(), d);
        Some(Self {
            numerator: n / g,
            denominator: d / g,
        })
    }

    pub fn zero() -> Self {
        Self {
            numerator: 0,
            denominator: 1,
        }
    }

    pub fn from_texts(num: &str, den: &str) -> Option<Self> {
        let n = parse_canonical_i128(num)?;
        let d = parse_canonical_i128(den)?;
        Self::new(n, d)
    }

    pub fn is_zero(self) -> bool {
        self.numerator == 0
    }

    /// Comparaison exacte via produit en croix.
    pub fn cmp_exact(self, other: Self) -> std::cmp::Ordering {
        let left = self.numerator.saturating_mul(other.denominator);
        let right = other.numerator.saturating_mul(self.denominator);
        left.cmp(&right)
    }

    /// Valeur décimale pour Excel uniquement (ratio 0,06812 pour 6,812 %).
    pub fn to_excel_ratio(self) -> Option<f64> {
        if self.denominator == 0 {
            return None;
        }
        Some((self.numerator as f64) / (self.denominator as f64))
    }

    fn checked_add(self, other: Self) -> Option<Self> {
        let num = self
            .numerator
            .checked_mul(other.denominator)?
            .checked_add(other.numerator.checked_mul(self.denominator)?)?;
        let den = self.denominator.checked_mul(other.denominator)?;
        Self::new(num, den)
    }

    fn checked_div_usize(self, n: usize) -> Option<Self> {
        if n == 0 {
            return None;
        }
        let den = self.denominator.checked_mul(n as i128)?;
        Self::new(self.numerator, den)
    }
}

fn gcd(mut a: i128, mut b: i128) -> i128 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

pub fn parse_canonical_i128(s: &str) -> Option<i128> {
    if !is_canonical_integer_text(s, true) {
        return None;
    }
    s.parse::<i128>().ok()
}

/// Taux de promotion = montant mensuel de promotion / salaire avant promotion.
///
/// Utilise la fraction persistée si disponible ; sinon calcule depuis les
/// montants. Un montant de promotion explicitement nul donne 0 % ; des NULL
/// nécessaires laissent le taux absent.
pub fn promotion_rate(employee: &EmployeeRow) -> Option<ExactRate> {
    if let (Some(num), Some(den)) = (
        employee.promotion_rate_num_text.as_deref(),
        employee.promotion_rate_den_text.as_deref(),
    ) {
        return ExactRate::from_texts(num, den);
    }

    match (
        employee.promotion_amount_text.as_deref(),
        employee.salary_before_promotion_text.as_deref(),
    ) {
        (None, _) => None,
        (Some(amount), Some(before)) => ExactRate::from_texts(amount, before),
        (Some(amount), None) => {
            let n = parse_canonical_i128(amount)?;
            if n == 0 {
                Some(ExactRate::zero())
            } else {
                None
            }
        }
    }
}

/// Complément mensuel réel persisté (jamais inventé).
pub fn monthly_complement_amount(employee: &EmployeeRow) -> Option<i128> {
    if let Some(text) = employee
        .technical_month_compensatory_complement_text
        .as_deref()
    {
        return parse_canonical_i128(text);
    }
    // Repli snapshot : augmentation arrondie = complément compensatoire.
    parse_canonical_i128(&employee.final_rounded_increase_fcfa_text)
}

/// Taux de complément = complément mensuel / salaire de référence (S0).
pub fn complement_rate(employee: &EmployeeRow) -> Option<ExactRate> {
    let complement = monthly_complement_amount(employee)?;
    let reference = parse_canonical_i128(&employee.s0_fcfa_text)?;
    ExactRate::new(complement, reference)
}

/// Taux total d’augmentation de base =
/// (promotion mensuelle + complément mensuel) / salaire de base décembre N-1.
///
/// Exclut l’ancienneté. Absent si aucune composante n’est disponible ou si le
/// dénominateur est invalide.
pub fn total_base_increase_rate(employee: &EmployeeRow) -> Option<ExactRate> {
    let promo = match employee.promotion_amount_text.as_deref() {
        None => None,
        Some(s) => Some(parse_canonical_i128(s)?),
    };
    let complement = match employee
        .technical_month_compensatory_complement_text
        .as_deref()
    {
        Some(s) => Some(parse_canonical_i128(s)?),
        None => {
            // Si le complément technique est absent, on peut encore utiliser
            // l’augmentation arrondie persistée (schéma v3 partiel / tests).
            if promo.is_some() {
                // Promotion seule connue : complément traité comme 0 uniquement
                // si l’augmentation arrondie est aussi absente ou nulle ?
                parse_canonical_i128(&employee.final_rounded_increase_fcfa_text)
            } else {
                parse_canonical_i128(&employee.final_rounded_increase_fcfa_text)
            }
        }
    };

    match (promo, complement) {
        (None, None) => None,
        (p, c) => {
            let num = p.unwrap_or(0).checked_add(c.unwrap_or(0))?;
            let den = parse_canonical_i128(&employee.salary_fcfa_text)?;
            ExactRate::new(num, den)
        }
    }
}

/// Augmentation mensuelle totale (promotion + complément), si calculable.
pub fn total_monthly_increase(employee: &EmployeeRow) -> Option<i128> {
    let promo = match employee.promotion_amount_text.as_deref() {
        None => 0,
        Some(s) => parse_canonical_i128(s)?,
    };
    let complement = monthly_complement_amount(employee)?;
    promo.checked_add(complement)
}

/// Statistiques exactes sur une population de taux.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RateStats {
    pub min: ExactRate,
    pub max: ExactRate,
    pub mean: ExactRate,
    pub median: ExactRate,
    pub count: usize,
}

pub fn compute_rate_stats(rates: &[ExactRate]) -> Option<RateStats> {
    if rates.is_empty() {
        return None;
    }
    let mut sorted = rates.to_vec();
    sorted.sort_by(|a, b| a.cmp_exact(*b));

    let min = sorted[0];
    let max = *sorted.last().unwrap();

    let mut sum = ExactRate::zero();
    for rate in rates {
        sum = sum.checked_add(*rate)?;
    }
    let mean = sum.checked_div_usize(rates.len())?;

    let median = if sorted.len() % 2 == 1 {
        sorted[sorted.len() / 2]
    } else {
        let left = sorted[sorted.len() / 2 - 1];
        let right = sorted[sorted.len() / 2];
        left.checked_add(right)?.checked_div_usize(2)?
    };

    Some(RateStats {
        min,
        max,
        mean,
        median,
        count: rates.len(),
    })
}

/// Index des sept tranches de taux d’augmentation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RateBucket {
    ExactZero = 0,
    UpTo2 = 1,
    UpTo4 = 2,
    UpTo6 = 3,
    UpTo8 = 4,
    UpTo10 = 5,
    Above10 = 6,
}

pub const RATE_BUCKET_LABELS: [&str; 7] = [
    "0 %",
    "> 0 % à 2 %",
    "> 2 % à 4 %",
    "> 4 % à 6 %",
    "> 6 % à 8 %",
    "> 8 % à 10 %",
    "> 10 %",
];

fn pct(n: i128) -> ExactRate {
    ExactRate::new(n, 100).expect("dénominateur 100")
}

/// Classe un taux dans une des sept tranches (bornes inclusives à droite).
pub fn classify_rate_bucket(rate: ExactRate) -> RateBucket {
    if rate.is_zero() {
        return RateBucket::ExactZero;
    }
    if rate.cmp_exact(pct(2)) != std::cmp::Ordering::Greater {
        return RateBucket::UpTo2;
    }
    if rate.cmp_exact(pct(4)) != std::cmp::Ordering::Greater {
        return RateBucket::UpTo4;
    }
    if rate.cmp_exact(pct(6)) != std::cmp::Ordering::Greater {
        return RateBucket::UpTo6;
    }
    if rate.cmp_exact(pct(8)) != std::cmp::Ordering::Greater {
        return RateBucket::UpTo8;
    }
    if rate.cmp_exact(pct(10)) != std::cmp::Ordering::Greater {
        return RateBucket::UpTo10;
    }
    RateBucket::Above10
}

/// Distribution des effectifs par tranche + nombre de taux non calculables.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RateDistribution {
    pub counts: [usize; 7],
    pub analyzable: usize,
    pub non_calculable: usize,
}

impl RateDistribution {
    pub fn from_optional_rates(rates: &[Option<ExactRate>]) -> Self {
        let mut counts = [0usize; 7];
        let mut analyzable = 0usize;
        let mut non_calculable = 0usize;
        for rate in rates {
            match rate {
                Some(r) => {
                    analyzable += 1;
                    counts[classify_rate_bucket(*r) as usize] += 1;
                }
                None => non_calculable += 1,
            }
        }
        Self {
            counts,
            analyzable,
            non_calculable,
        }
    }

    pub fn share_of_analyzable(&self, bucket: usize) -> Option<ExactRate> {
        if self.analyzable == 0 {
            return None;
        }
        ExactRate::new(self.counts[bucket] as i128, self.analyzable as i128)
    }
}

/// Facteur de position milli → décimal (1050 → 1,050).
pub fn position_factor_from_milli(milli: i64) -> f64 {
    (milli as f64) / 1000.0
}

/// Ratio salaire points de base → ratio Excel (8571 → 0,8571 pour 85,71 %).
pub fn salary_ratio_from_basis_points(bp: i64) -> f64 {
    (bp as f64) / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn emp_with(
        salary: &str,
        s0: &str,
        promo: Option<&str>,
        before: Option<&str>,
        complement: Option<&str>,
        rounded: &str,
    ) -> EmployeeRow {
        EmployeeRow {
            id: 1,
            employee_id: "E1".into(),
            employee_display_name: None,
            family_code: "F".into(),
            family_label: None,
            grade_code: "G".into(),
            grade_label: None,
            salary_fcfa_text: salary.into(),
            s0_fcfa_text: s0.into(),
            salary_ratio_basis_points: 0,
            salary_position_code: "mid".into(),
            salary_position_label: "Milieu".into(),
            position_factor_milli: 1000,
            evaluation_mode: "none".into(),
            performance_level: None,
            potential_level: None,
            blocking_reason: None,
            theoretical_increase_rate_numerator_text: "0".into(),
            theoretical_increase_rate_denominator_text: "1".into(),
            final_rounded_increase_fcfa_text: rounded.into(),
            final_salary_fcfa_text: salary.into(),
            employment_status: None,
            contract_type: None,
            hire_date: None,
            is_minimum_increase_population_employee: None,
            has_structured_promotion: None,
            compensatory_measure_eligible: None,
            promotion_date: None,
            previous_grade_code: None,
            promoted_grade_code: None,
            promotion_amount_text: promo.map(str::to_string),
            annual_actual_cost_text: None,
            combined_annual_actual_cost_text: None,
            annual_seniority_impact_text: None,
            technical_month_final_salary_text: None,
            campaign_year: None,
            technical_application_month: None,
            salary_before_promotion_text: before.map(str::to_string),
            salary_after_promotion_text: None,
            promotion_rate_num_text: None,
            promotion_rate_den_text: None,
            is_promotion_budget_population_employee: None,
            compensatory_ineligibility_reason_code: None,
            compensatory_eligibility_kind: None,
            promotion_status_kind: None,
            technical_month_compensatory_complement_text: complement.map(str::to_string),
            campaign_period_minimum_complement_floor_cost_text: None,
            campaign_period_compensation_above_minimum_cost_text: None,
            annual_promotion_budget_cost_text: None,
            annual_promotion_seniority_impact_text: None,
            combined_annual_seniority_impact_text: None,
            base_salary_reminder_text: None,
            remaining_year_direct_increase_cost_text: None,
            full_year_run_rate_promotion_cost_text: None,
            full_year_run_rate_compensatory_cost_text: None,
            full_year_run_rate_combined_base_measure_cost_text: None,
            full_year_run_rate_seniority_impact_text: None,
            technical_application_month_seniority_rate_percent: None,
            minimum_compensatory_reminder_text: None,
            above_minimum_compensatory_reminder_text: None,
        }
    }

    #[test]
    fn example_8827_over_129580_is_about_6_812_percent() {
        let rate = ExactRate::from_texts("8827", "129580").unwrap();
        let ratio = rate.to_excel_ratio().unwrap();
        assert!((ratio - 0.068_120_08).abs() < 1e-9);
        assert!((ratio * 100.0 - 6.812_008).abs() < 1e-6);
    }

    #[test]
    fn total_rate_excludes_seniority() {
        let e = emp_with(
            "100000",
            "90000",
            Some("2000"),
            Some("98000"),
            Some("3000"),
            "3000",
        );
        let rate = total_base_increase_rate(&e).unwrap();
        // (2000 + 3000) / 100000 = 5 %
        assert_eq!(rate, ExactRate::from_texts("1", "20").unwrap());
    }

    #[test]
    fn zero_denominator_yields_none() {
        assert!(ExactRate::from_texts("10", "0").is_none());
        let e = emp_with("0", "90000", Some("100"), Some("0"), Some("50"), "50");
        // salaire base 0 → total absent
        assert!(total_base_increase_rate(&e).is_none());
        // salaire avant promo 0 → promotion absente
        assert!(promotion_rate(&e).is_none());
    }

    #[test]
    fn explicit_zero_promotion_is_zero_percent() {
        let e = emp_with("100000", "90000", Some("0"), None, Some("0"), "0");
        assert_eq!(promotion_rate(&e), Some(ExactRate::zero()));
    }

    #[test]
    fn null_promotion_without_amount_is_absent() {
        let e = emp_with("100000", "90000", None, None, Some("5000"), "5000");
        assert!(promotion_rate(&e).is_none());
    }

    #[test]
    fn mean_and_median_odd_even() {
        let a = ExactRate::from_texts("1", "100").unwrap(); // 1 %
        let b = ExactRate::from_texts("2", "100").unwrap(); // 2 %
        let c = ExactRate::from_texts("3", "100").unwrap(); // 3 %
        let d = ExactRate::from_texts("4", "100").unwrap(); // 4 %

        let odd = compute_rate_stats(&[a, b, c]).unwrap();
        assert_eq!(odd.median, b);
        assert_eq!(odd.min, a);
        assert_eq!(odd.max, c);
        assert_eq!(odd.mean, ExactRate::from_texts("2", "100").unwrap());

        let even = compute_rate_stats(&[a, b, c, d]).unwrap();
        // médiane = (2 % + 3 %) / 2 = 2,5 %
        assert_eq!(even.median, ExactRate::from_texts("5", "200").unwrap());
        assert_eq!(even.min, a);
        assert_eq!(even.max, d);
    }

    #[test]
    fn bucket_boundaries() {
        assert_eq!(
            classify_rate_bucket(ExactRate::zero()),
            RateBucket::ExactZero
        );
        assert_eq!(
            classify_rate_bucket(ExactRate::from_texts("1", "1000").unwrap()), // 0,1 %
            RateBucket::UpTo2
        );
        assert_eq!(
            classify_rate_bucket(ExactRate::from_texts("2", "100").unwrap()),
            RateBucket::UpTo2
        );
        assert_eq!(
            classify_rate_bucket(ExactRate::from_texts("201", "10000").unwrap()), // 2,01 %
            RateBucket::UpTo4
        );
        assert_eq!(
            classify_rate_bucket(ExactRate::from_texts("10", "100").unwrap()),
            RateBucket::UpTo10
        );
        assert_eq!(
            classify_rate_bucket(ExactRate::from_texts("1001", "10000").unwrap()), // 10,01 %
            RateBucket::Above10
        );
    }

    #[test]
    fn non_calculable_not_in_zero_bucket() {
        let dist = RateDistribution::from_optional_rates(&[
            Some(ExactRate::zero()),
            None,
            Some(ExactRate::from_texts("3", "100").unwrap()),
        ]);
        assert_eq!(dist.counts[RateBucket::ExactZero as usize], 1);
        assert_eq!(dist.non_calculable, 1);
        assert_eq!(dist.analyzable, 2);
        assert_eq!(dist.counts.iter().sum::<usize>() + dist.non_calculable, 3);
    }

    #[test]
    fn display_helpers() {
        assert!((position_factor_from_milli(1050) - 1.05).abs() < 1e-12);
        assert!((salary_ratio_from_basis_points(8571) - 0.8571).abs() < 1e-12);
    }
}
