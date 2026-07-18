export type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "PERSISTENCE";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toUserMessage(error: unknown, fallback: string): string {
  if (isAppError(error)) {
    return error.message;
  }
  return fallback;
}
