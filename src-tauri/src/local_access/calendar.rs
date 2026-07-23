//! Calculs de dates civiles UTC pour la période de validité initiale et la
//! détection d’anomalie d’horloge (Lot 2B-RC1-SEC1-A).

use time::format_description::well_known::Rfc3339;
use time::{Date, Duration, Month, OffsetDateTime, PrimitiveDateTime};

use super::error::LocalAccessError;

/// Durée de la période initiale avant activation d’une licence (SEC1-B).
pub const INITIAL_VALIDITY_MONTHS: u32 = 10;

/// Tolérance avant de considérer un recul d’horloge comme une anomalie.
pub const CLOCK_ANOMALY_TOLERANCE: Duration = Duration::hours(24);

pub fn now_utc() -> OffsetDateTime {
    OffsetDateTime::now_utc()
}

pub fn to_rfc3339(value: OffsetDateTime) -> Result<String, LocalAccessError> {
    value
        .format(&Rfc3339)
        .map_err(|error| LocalAccessError::Database(format!("format rfc3339: {error}")))
}

pub fn parse_rfc3339(value: &str) -> Result<OffsetDateTime, LocalAccessError> {
    OffsetDateTime::parse(value, &Rfc3339)
        .map_err(|_| LocalAccessError::Database("date persistée invalide".into()))
}

fn last_day_of_month(year: i32, month: Month) -> u8 {
    let (next_year, next_month) = if month == Month::December {
        (year + 1, Month::January)
    } else {
        (year, month.next())
    };
    Date::from_calendar_date(next_year, next_month, 1)
        .expect("premier jour du mois suivant toujours valide")
        .previous_day()
        .expect("le premier jour d’un mois a toujours un jour précédent")
        .day()
}

/// Ajoute `months_to_add` mois civils à `origin`, en calant le jour sur le
/// dernier jour du mois cible lorsque le jour d’origine n’existe pas (ex. 31
/// janvier + 1 mois → 28 ou 29 février selon l’année).
pub fn add_calendar_months(origin: OffsetDateTime, months_to_add: u32) -> OffsetDateTime {
    let date = origin.date();
    let time = origin.time();
    let origin_month_index = date.month() as u32 - 1;
    let total_months = origin_month_index + months_to_add;
    let year = date.year() + (total_months / 12) as i32;
    let month_index = total_months % 12;
    let month = Month::try_from((month_index + 1) as u8).expect("index de mois dans 0..12");
    let day = date.day().min(last_day_of_month(year, month));
    let new_date = Date::from_calendar_date(year, month, day).expect("date civile valide");
    PrimitiveDateTime::new(new_date, time).assume_utc()
}

/// Calcule la date de fin de la période de validité initiale (10 mois civils).
pub fn initial_valid_until(installed_at: OffsetDateTime) -> OffsetDateTime {
    add_calendar_months(installed_at, INITIAL_VALIDITY_MONTHS)
}

/// La licence est valide tant que `now <= valid_until` ; expirée sinon.
pub fn is_expired(now: OffsetDateTime, valid_until: OffsetDateTime) -> bool {
    now > valid_until
}

/// Jours civils restants jusqu’à `valid_until` (0 si déjà expiré). `None` si
/// la date persistée est illisible.
pub fn remaining_days_until(now: OffsetDateTime, valid_until_text: &str) -> Option<i64> {
    let valid_until = parse_rfc3339(valid_until_text).ok()?;
    if is_expired(now, valid_until) {
        return Some(0);
    }
    Some((valid_until - now).whole_days().max(0))
}

/// Anomalie d’horloge : l’horloge système a reculé de plus de 24h par rapport
/// à la dernière observation persistée.
pub fn is_clock_anomaly(now: OffsetDateTime, last_observed_at: OffsetDateTime) -> bool {
    now < last_observed_at - CLOCK_ANOMALY_TOLERANCE
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn adds_ten_months_within_same_year_without_clamp() {
        let origin = datetime!(2026-01-15 08:00:00 UTC);
        let result = add_calendar_months(origin, 10);
        assert_eq!(result, datetime!(2026-11-15 08:00:00 UTC));
    }

    #[test]
    fn adds_months_crossing_year_boundary() {
        let origin = datetime!(2026-06-01 00:00:00 UTC);
        let result = add_calendar_months(origin, 10);
        assert_eq!(result, datetime!(2027-04-01 00:00:00 UTC));
    }

    #[test]
    fn clamps_to_last_day_of_shorter_target_month() {
        // 31 janvier + 1 mois -> 28 février (2026 n’est pas bissextile).
        let origin = datetime!(2026-01-31 12:00:00 UTC);
        let result = add_calendar_months(origin, 1);
        assert_eq!(result, datetime!(2026-02-28 12:00:00 UTC));
    }

    #[test]
    fn clamps_to_leap_day_on_leap_year() {
        let origin = datetime!(2024-01-31 12:00:00 UTC);
        let result = add_calendar_months(origin, 1);
        assert_eq!(result, datetime!(2024-02-29 12:00:00 UTC));
    }

    #[test]
    fn thirty_first_plus_ten_months_clamps_to_thirty() {
        // 31 mai + 10 mois -> 31 mars (mois de 31 jours, pas de clamp).
        let origin = datetime!(2026-05-31 00:00:00 UTC);
        let result = add_calendar_months(origin, 10);
        assert_eq!(result, datetime!(2027-03-31 00:00:00 UTC));
    }

    #[test]
    fn expiry_boundary_is_inclusive() {
        let valid_until = datetime!(2026-11-15 08:00:00 UTC);
        assert!(!is_expired(valid_until, valid_until));
        assert!(!is_expired(valid_until - Duration::seconds(1), valid_until));
        assert!(is_expired(valid_until + Duration::seconds(1), valid_until));
    }

    #[test]
    fn clock_anomaly_requires_more_than_twenty_four_hours_regression() {
        let last_observed = datetime!(2026-07-22 12:00:00 UTC);
        assert!(!is_clock_anomaly(
            last_observed - Duration::hours(23),
            last_observed
        ));
        assert!(!is_clock_anomaly(last_observed, last_observed));
        assert!(!is_clock_anomaly(
            last_observed + Duration::hours(1),
            last_observed
        ));
        assert!(is_clock_anomaly(
            last_observed - Duration::hours(25),
            last_observed
        ));
    }

    #[test]
    fn rfc3339_round_trip_preserves_instant() {
        let value = datetime!(2026-07-22 23:39:00 UTC);
        let text = to_rfc3339(value).expect("format");
        let parsed = parse_rfc3339(&text).expect("parse");
        assert_eq!(parsed, value);
    }
}
