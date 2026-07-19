/** Normalisation déterministe des en-têtes de colonnes importées. */

/**
 * Met en minuscule, retire les accents (NFD) et remplace toute séquence de
 * ponctuation, espaces, tirets ou soulignés par un espace unique. Le résultat
 * est stable pour comparer des en-têtes saisis avec des variantes de casse,
 * d’accentuation ou de séparateurs.
 */
export function normalizeHeaderKey(value: string): string {
  const withoutAccents = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const lowered = withoutAccents.toLowerCase();
  const withSpacesOnly = lowered.replace(/[^a-z0-9]+/g, " ");
  return withSpacesOnly.trim().replace(/\s+/g, " ");
}
