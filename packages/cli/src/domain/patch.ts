/**
 * Small, anchored mutation helpers shared by fullstack scaffold and workspace
 * env wiring. Every lookup/patch fails generation (`E-FILE-WRITE`) when the
 * template anchor moves, so a rendered app can never be half-wired.
 */

import { fail } from "./errors.ts";
import type { VirtualFile } from "./types.ts";

export function lines(...items: string[]): string {
  return `${items.join("\n")}\n`;
}

export function requireFile(files: VirtualFile[], path: string): VirtualFile {
  const file = files.find((entry) => entry.path === path);
  if (file === undefined) {
    fail("E-FILE-WRITE", `missing generated file "${path}"`);
  }
  return file;
}

export function replaceFile(files: VirtualFile[], path: string, contents: string): void {
  requireFile(files, path).contents = contents;
}

export function patchText(
  files: VirtualFile[],
  path: string,
  search: string,
  replacement: string,
): void {
  const file = requireFile(files, path);
  if (!file.contents.includes(search)) {
    fail("E-FILE-WRITE", `missing anchor in "${path}"`);
  }
  // `lines()` ends with a newline. When the anchor does not consume that
  // newline, trim it from the replacement or every insertion grows a blank
  // line; when the anchor itself ends with one, keep it to avoid joining lines.
  const inline =
    !search.endsWith("\n") && replacement.endsWith("\n") ? replacement.slice(0, -1) : replacement;
  file.contents = file.contents.replace(search, inline);
}

export function patchPackageJson(
  files: VirtualFile[],
  path: string,
  mutate: (pkg: Record<string, unknown>) => void,
): void {
  const file = requireFile(files, path);
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(file.contents) as Record<string, unknown>;
  } catch {
    fail("E-FILE-WRITE", `invalid package.json "${path}"`);
  }
  mutate(pkg);
  file.contents = `${JSON.stringify(pkg, null, 2)}\n`;
}
