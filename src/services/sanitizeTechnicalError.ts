/** Journalisation technique non nominative pour le diagnostic d’import RH. */

export interface SanitizedTechnicalError {
  detectedType: string;
  name: string | null;
  message: string | null;
  code: string | number | null;
  cause: string | null;
}

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bmatricule\b/i,
  /\bemployee[_ ]?number\b/i,
  /\bnom\b/i,
  /\bemployee[_ ]?label\b/i,
  /\bsalaire\b/i,
  /\bdecember[_ ]?base[_ ]?salary\b/i,
  /\b[A-Za-z]:\\/,
  /\b\\\\[^\\\s]+/,
  /\bVALUES\s*\(/i,
  /\bbind/i,
];

/**
 * Extrait uniquement des métadonnées techniques sûres d’une erreur.
 * Exclut matricules, noms, salaires, SQL paramétré et chemins complets.
 */
export function sanitizeTechnicalError(error: unknown): SanitizedTechnicalError {
  if (error === null || error === undefined) {
    return {
      detectedType: String(error),
      name: null,
      message: null,
      code: null,
      cause: null,
    };
  }

  if (typeof error === "string") {
    return {
      detectedType: "string",
      name: null,
      message: scrubText(error),
      code: null,
      cause: null,
    };
  }

  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    const withCause = error as Error & { cause?: unknown };
    return {
      detectedType: "Error",
      name: scrubText(error.name),
      message: scrubText(error.message),
      code: readCode(withCode.code),
      cause: sanitizeCause(withCause.cause),
    };
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      detectedType: "object",
      name: typeof record.name === "string" ? scrubText(record.name) : null,
      message:
        typeof record.message === "string" ? scrubText(record.message) : null,
      code: readCode(record.code),
      cause: sanitizeCause(record.cause),
    };
  }

  return {
    detectedType: typeof error,
    name: null,
    message: scrubText(String(error)),
    code: null,
    cause: null,
  };
}

function readCode(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

function sanitizeCause(cause: unknown): string | null {
  if (cause === null || cause === undefined) {
    return null;
  }
  if (cause instanceof Error) {
    return scrubText(`${cause.name}: ${cause.message}`);
  }
  if (typeof cause === "string") {
    return scrubText(cause);
  }
  return scrubText(String(cause));
}

function scrubText(value: string): string {
  let text = value;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      return "[redacted]";
    }
  }
  // Chemins Unix absolus ou segments trop longs type dump SQL.
  if (text.includes("/Users/") || text.includes("/home/")) {
    return "[redacted]";
  }
  if (text.length > 500) {
    return `${text.slice(0, 500)}…`;
  }
  return text;
}
