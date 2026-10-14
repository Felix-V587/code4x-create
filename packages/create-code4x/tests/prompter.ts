import { CancelledError, type Prompter } from "../src/domain/flow.ts";

export type PromptKind = "text" | "select" | "multiselect" | "confirm";

export interface Script {
  text?: string[];
  select?: string[];
  multiselect?: string[][];
  confirm?: boolean[];
  /** Throw CancelledError when this prompt kind is reached. */
  cancelAt?: PromptKind;
}

export interface ScriptedPrompter extends Prompter {
  log: string[];
}

/** Deterministic Prompter for tests: consumes queued answers in call order. */
export function scriptedPrompter(script: Script): ScriptedPrompter {
  const log: string[] = [];
  const next = <T>(queue: T[] | undefined, kind: PromptKind): T => {
    if (script.cancelAt === kind) throw new CancelledError();
    if (!queue || queue.length === 0) throw new Error(`no scripted answer for ${kind}`);
    return queue.shift() as T;
  };
  return {
    log,
    intro: (message) => log.push(`intro:${message}`),
    outro: (message) => log.push(`outro:${message}`),
    info: (message) => log.push(`info:${message}`),
    note: (message, title) => log.push(`note:${title ?? ""}:${message}`),
    async text(options) {
      log.push(`text:${options.message}`);
      return next(script.text, "text");
    },
    async select(options) {
      log.push(`select:${options.message}`);
      return next(script.select, "select");
    },
    async multiselect(options) {
      log.push(`multiselect:${options.message}`);
      return next(script.multiselect, "multiselect");
    },
    async confirm(options) {
      log.push(`confirm:${options.message}`);
      return next(script.confirm, "confirm");
    },
  };
}
