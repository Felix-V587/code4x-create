/**
 * Error codes + throw helpers.
 *
 * Covers docs/03 §2.4 (`E-CYCLE` … `E-PLUGIN-WRITE`) and the docs/04 usage-layer
 * codes (`E-DIR-REQUIRED`, `E-DIR-NOT-EMPTY`, `E-INVALID-VALUE`, `E-CONFIG-*`, …).
 *
 * Exit code contract (docs/04 §4):
 *   0   success
 *   1   domain / generation error (E-*)
 *   2   usage error (argument parsing / config / cross-field contradictions)
 */

export type ErrorCode =
  // ---- docs/03 §2.4 domain errors ----
  | "E-CYCLE"
  | "E-MISSING-REQ"
  | "E-UNK-ANCHOR"
  | "E-MARKER"
  | "E-FILE-WRITE"
  | "E-DEP-VERSION"
  | "E-SCRIPT-KEY"
  | "E-IMPORT-CONFLICT"
  | "E-STMT-DUP"
  | "E-SINGLE-SLOT"
  | "E-PLUGIN-WRITE"
  // ---- docs/04 usage / edge errors ----
  | "E-DIR-REQUIRED"
  | "E-DIR-NOT-EMPTY"
  | "E-INVALID-VALUE"
  | "E-FEATURE-FRAMEWORK"
  | "E-MIXED-FRAMEWORK"
  | "E-AMBIGUOUS-LIST"
  | "E-CONFIG-KEY"
  | "E-CONFIG-READ"
  | "E-CONFIG-PARSE"
  | "E-CONFLICT"
  | "E-OVERWRITE-REFUSED"
  | "E-UNKNOWN-FRAMEWORK";

export interface Code4xErrorOptions {
  /** Suggested fix shown after the main message. */
  fix?: string;
  /** Override the default exit code for this error code. */
  exitCode?: number;
}

/** Error codes that are usage errors (exit 2) rather than domain errors (exit 1). */
const USAGE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "E-DIR-REQUIRED",
  "E-INVALID-VALUE",
  "E-CONFIG-KEY",
  "E-CONFIG-READ",
  "E-CONFIG-PARSE",
  "E-CONFLICT",
  "E-AMBIGUOUS-LIST",
  "E-UNKNOWN-FRAMEWORK",
]);

export class Code4xError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly fix?: string;

  constructor(code: ErrorCode, message: string, options: Code4xErrorOptions = {}) {
    super(message);
    this.name = "Code4xError";
    this.code = code;
    this.fix = options.fix;
    this.exitCode = options.exitCode ?? (USAGE_CODES.has(code) ? 2 : 1);
  }
}

/** Throw a domain error (exit 1 by default). */
export function fail(code: ErrorCode, message: string, options: Code4xErrorOptions = {}): never {
  throw new Code4xError(code, message, options);
}

/** Build (but do not throw) a usage error. */
export function usage(
  code: ErrorCode,
  message: string,
  options: Omit<Code4xErrorOptions, "exitCode"> = {},
): Code4xError {
  return new Code4xError(code, message, { ...options, exitCode: 2 });
}

export function isCode4xError(value: unknown): value is Code4xError {
  return value instanceof Code4xError;
}
