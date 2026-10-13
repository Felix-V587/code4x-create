/**
 * Materialization: `Plan -> VirtualFile[]`. Pure, no I/O.
 *
 * The registry already carries every skeleton/asset as text, so this is a pure
 * function of `(plan, registry)`. Consequence: the same plan renders
 * byte-identically twice (idempotency), which the tests assert directly.
 */

import { fail } from "./errors.ts";
import { contributionFor } from "./registry.ts";
import type { Registry, RuntimeAssembly } from "./registry.ts";
import type {
  AnchorSpec,
  Answers,
  FeatureContribution,
  FeatureId,
  PackageJsonPatch,
  Plan,
  ProjectContext,
  ScriptEdit,
  VirtualFile,
  WiringBlock,
  WiringContribution,
} from "./types.ts";

interface ContributionSource {
  /** Provenance label for `.code4xrc.json` (`"base"` or a feature id). */
  source: string;
  featureId: FeatureId | null;
  rank: number;
  assetPrefix: string;
  contribution: FeatureContribution;
}

interface Hit {
  block: WiringBlock;
  order: number;
  rank: number;
  featureId: string;
}

const MARKER = /^([ \t]*)\/\/ @code4x:(begin|end) (\S+)[ \t]*$/;

export function render(
  plan: Plan,
  reg: Registry,
  context: ProjectContext | undefined = plan.context,
): VirtualFile[] {
  const blueprint = reg.frameworks[plan.framework];
  if (!blueprint) {
    fail("E-INVALID-VALUE", `unknown framework "${plan.framework}"`);
  }

  const rank = new Map<FeatureId, number>();
  plan.features.forEach((id, index) => rank.set(id, index));

  // `when` conditions must observe the *resolved* selection (qualified ids +
  // dependency closure), not the raw user tokens. e.g. a bare `--features
  // swagger-openapi` normalizes to `hono/swagger-openapi` only in `plan.features`.
  const conditionAnswers: Answers = { ...plan.answers, features: plan.features };

  const contributions: ContributionSource[] = [
    {
      source: "base",
      featureId: null,
      rank: -1,
      assetPrefix: blueprint.id,
      contribution: blueprint.static,
    },
    ...plan.features.map((id) => ({
      source: id,
      featureId: id,
      rank: rank.get(id) ?? 0,
      assetPrefix: id,
      contribution: contributionFor(reg.features[id], plan.framework),
    })),
  ];

  assertKnownAnchors(blueprint.assembly, contributions);

  const outputs = new Map<string, { file: VirtualFile; onCollision?: "error" | "identical-ok" }>();
  const packagePatches = contributions
    .map((c) => c.contribution.packageJson)
    .filter((patch): patch is PackageJsonPatch => patch !== undefined);

  // 1. static files.
  for (const c of contributions) {
    const isBlueprint = c.featureId === null;
    for (const spec of c.contribution.files ?? []) {
      if (spec.when && !spec.when(conditionAnswers, context)) continue;
      const raw = reg.assets[`${c.assetPrefix}/${spec.src}`];
      if (raw === undefined) {
        fail("E-FILE-WRITE", `missing asset "${c.assetPrefix}/${spec.src}"`);
      }
      let contents = raw;
      if (isBlueprint) contents = contents.replaceAll("{PROJECT}", plan.answers.projectName);
      if (isBlueprint && spec.dest === "package.json" && packagePatches.length > 0) {
        contents = applyPackagePatches(contents, packagePatches);
      }
      addFile(outputs, spec.dest, contents, c.source, spec.onCollision);
    }
  }

  // 2. assembled files.
  for (const assembly of blueprint.assembly) {
    const contents = renderAssembly(
      assembly,
      blueprint.id,
      contributions,
      conditionAnswers,
      reg.assets,
      context,
    );
    addFile(outputs, assembly.path, contents, "assembly");
  }

  return [...outputs.values()]
    .map((entry) => entry.file)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// --------------------------------------------------------------------------
// assembly rendering
// --------------------------------------------------------------------------

interface Region {
  name: string;
  indent: string;
}

type Token = { type: "line"; text: string } | { type: "region"; name: string; indent: string };

function renderAssembly(
  assembly: RuntimeAssembly,
  blueprintId: string,
  contributions: ContributionSource[],
  answers: Answers,
  assets: Registry["assets"],
  context: ProjectContext | undefined,
): string {
  const { tokens, regions } = parseSkeleton(assembly.skeleton, assembly.path);
  const declared = Object.keys(assembly.anchors);

  for (const name of declared) {
    if (!regions.has(name)) {
      fail("E-MARKER", `skeleton "${assembly.path}" is missing anchor "${name}"`);
    }
  }
  for (const name of regions.keys()) {
    if (!declared.includes(name)) {
      fail("E-MARKER", `skeleton "${assembly.path}" has undeclared marker "${name}"`);
    }
  }

  const lines: string[] = [];
  for (const token of tokens) {
    if (token.type === "line") {
      lines.push(token.text);
      continue;
    }
    const spec = assembly.anchors[token.name];
    const rendered = renderRegion(
      token.name,
      spec,
      token.indent,
      contributions,
      answers,
      blueprintId,
      assets,
      context,
    );
    lines.push(...rendered);
  }
  return collapseBlankLines(lines);
}

function parseSkeleton(
  skeleton: string,
  path: string,
): { tokens: Token[]; regions: Map<string, Region> } {
  const tokens: Token[] = [];
  const regions = new Map<string, Region>();
  let open: { name: string; indent: string } | null = null;

  for (const raw of skeleton.split("\n")) {
    const match = MARKER.exec(raw);
    if (!match) {
      if (!open) tokens.push({ type: "line", text: raw });
      continue;
    }
    const [, indent, keyword, name] = match;
    if (keyword === "begin") {
      if (open) {
        fail("E-MARKER", `skeleton "${path}" nests marker "${name}" inside "${open.name}"`);
      }
      if (regions.has(name)) {
        fail("E-MARKER", `skeleton "${path}" repeats anchor "${name}"`);
      }
      open = { name, indent };
    } else {
      if (!open || open.name !== name) {
        fail("E-MARKER", `skeleton "${path}" has unmatched end marker "${name}"`);
      }
      regions.set(name, { name, indent: open.indent });
      tokens.push({ type: "region", name, indent: open.indent });
      open = null;
    }
  }
  if (open) {
    fail("E-MARKER", `skeleton "${path}" has unclosed anchor "${open.name}"`);
  }
  return { tokens, regions };
}

function renderRegion(
  anchor: string,
  spec: AnchorSpec | undefined,
  indent: string,
  contributions: ContributionSource[],
  answers: Answers,
  blueprintId: string,
  assets: Registry["assets"],
  context: ProjectContext | undefined,
): string[] {
  if (!spec) fail("E-UNK-ANCHOR", `no anchor spec for "${anchor}"`);

  const hits = collectHits(anchor, contributions, answers, assets, context);

  if (spec.kind === "imports") {
    return indentLines(renderImports(hits), indent);
  }

  if (spec.kind === "single") {
    if (hits.length > 1) {
      fail("E-SINGLE-SLOT", `single anchor "${anchor}" received ${hits.length} blocks`);
    }
    if (hits.length === 0) {
      const fallback = spec.single?.default;
      if (!fallback) return [];
      const block = resolveBlock(fallback, blueprintId, assets);
      return indentLines(renderBlockLines(block), indent);
    }
    return indentLines(renderBlockLines(hits[0].block), indent);
  }

  // list
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const hit of hits) {
    for (const line of renderBlockLines(hit.block)) {
      if (seen.has(line)) {
        fail("E-STMT-DUP", `duplicate statement in anchor "${anchor}": ${line}`);
      }
      seen.add(line);
      lines.push(line);
    }
  }
  return indentLines(lines, indent);
}

function collectHits(
  anchor: string,
  contributions: ContributionSource[],
  answers: Answers,
  assets: Registry["assets"],
  context: ProjectContext | undefined,
): Hit[] {
  const hits: Hit[] = [];
  for (const c of contributions) {
    for (const wiring of c.contribution.wiring ?? []) {
      if (wiring.anchor !== anchor) continue;
      if (wiring.when && !wiring.when(answers, context)) continue;
      hits.push({
        block: resolveBlock(wiring.block, c.assetPrefix, assets),
        order: wiring.order,
        rank: c.rank,
        featureId: c.featureId ?? "",
      });
    }
  }
  hits.sort(
    (a, b) =>
      a.order - b.order ||
      a.rank - b.rank ||
      (a.featureId < b.featureId ? -1 : a.featureId > b.featureId ? 1 : 0),
  );
  return hits;
}

function resolveBlock(
  block: WiringContribution["block"],
  assetPrefix: string,
  assets: Registry["assets"],
): WiringBlock {
  if ("kind" in block) return block;
  const raw = assets[`${assetPrefix}/${block.src}`];
  if (raw === undefined) {
    fail("E-FILE-WRITE", `missing wiring fragment "${assetPrefix}/${block.src}"`);
  }
  let code = raw;
  for (const [key, value] of Object.entries(block.bind ?? {})) {
    code = code.replaceAll(`{${key}}`, String(value));
  }
  return { kind: "raw", code };
}

function renderBlockLines(block: WiringBlock): string[] {
  switch (block.kind) {
    case "import": {
      const parts: string[] = [];
      if (block.defaultAs) parts.push(block.defaultAs);
      if (block.named && block.named.length > 0) {
        parts.push(`{ ${[...block.named].sort().join(", ")} }`);
      }
      const prefix = block.typeOnly ? "import type" : "import";
      return [`${prefix} ${parts.join(", ")} from '${block.module}'`];
    }
    case "call":
      return [`${block.callee}(${block.expression})`];
    case "raw":
      return block.code.split("\n");
  }
}

// --------------------------------------------------------------------------
// imports aggregation
// --------------------------------------------------------------------------

interface ModuleImports {
  valueDefault?: string;
  valueNamed: Set<string>;
  typeDefault?: string;
  typeNamed: Set<string>;
}

function renderImports(hits: Hit[]): string[] {
  const byModule = new Map<string, ModuleImports>();
  const extras: string[] = [];

  for (const hit of hits) {
    const block = hit.block;
    if (block.kind !== "import") {
      extras.push(...renderBlockLines(block));
      continue;
    }
    let entry = byModule.get(block.module);
    if (!entry) {
      entry = { valueNamed: new Set(), typeNamed: new Set() };
      byModule.set(block.module, entry);
    }
    if (block.defaultAs) {
      if (block.typeOnly) {
        if (entry.typeDefault && entry.typeDefault !== block.defaultAs) {
          fail(
            "E-IMPORT-CONFLICT",
            `module "${block.module}" has conflicting type default imports`,
          );
        }
        entry.typeDefault = block.defaultAs;
      } else {
        if (entry.valueDefault && entry.valueDefault !== block.defaultAs) {
          fail("E-IMPORT-CONFLICT", `module "${block.module}" has conflicting default imports`);
        }
        entry.valueDefault = block.defaultAs;
      }
    }
    const target = block.typeOnly ? entry.typeNamed : entry.valueNamed;
    for (const name of block.named ?? []) target.add(name);
  }

  const modules = [...byModule.keys()].sort((a, b) => {
    const ra = isRelative(a) ? 1 : 0;
    const rb = isRelative(b) ? 1 : 0;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  });

  const lines: string[] = [];
  for (const module of modules) {
    const entry = byModule.get(module) as ModuleImports;
    const value = formatImportParts(entry.valueDefault, entry.valueNamed);
    if (value.length > 0) lines.push(`import ${value.join(", ")} from '${module}'`);
    const type = formatImportParts(entry.typeDefault, entry.typeNamed);
    if (type.length > 0) lines.push(`import type ${type.join(", ")} from '${module}'`);
  }

  for (const line of extras) lines.push(line);
  return lines;
}

function formatImportParts(defaultAs: string | undefined, named: Set<string>): string[] {
  const parts: string[] = [];
  if (defaultAs) parts.push(defaultAs);
  if (named.size > 0) parts.push(`{ ${[...named].sort().join(", ")} }`);
  return parts;
}

function isRelative(module: string): boolean {
  return module.startsWith("./") || module.startsWith("../");
}

// --------------------------------------------------------------------------
// package.json merging
// --------------------------------------------------------------------------

function applyPackagePatches(baseText: string, patches: PackageJsonPatch[]): string {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(baseText) as Record<string, unknown>;
  } catch {
    fail("E-FILE-WRITE", "template package.json is not valid JSON");
  }

  const setKeys = new Set<string>();
  const editKeys = new Set<string>();

  for (const patch of patches) {
    mergeDeps(pkg, "dependencies", patch.dependencies);
    mergeDeps(pkg, "devDependencies", patch.devDependencies);
    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
    pkg.scripts = scripts;
    for (const [key, edit] of Object.entries(patch.scripts ?? {})) {
      applyScriptEdit(scripts, key, edit, setKeys, editKeys);
    }
  }

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function mergeDeps(
  pkg: Record<string, unknown>,
  field: "dependencies" | "devDependencies",
  incoming: Record<string, string> | undefined,
): void {
  if (!incoming) return;
  const target = (pkg[field] as Record<string, string> | undefined) ?? {};
  pkg[field] = target;
  for (const [name, version] of Object.entries(incoming)) {
    const existing = target[name];
    if (existing !== undefined && existing !== version) {
      fail(
        "E-DEP-VERSION",
        `dependency "${name}" requested at both "${existing}" and "${version}"`,
      );
    }
    target[name] = version;
  }
}

function applyScriptEdit(
  scripts: Record<string, string>,
  key: string,
  edit: ScriptEdit,
  setKeys: Set<string>,
  editKeys: Set<string>,
): void {
  if ("set" in edit) {
    if (setKeys.has(key) || editKeys.has(key)) {
      fail("E-SCRIPT-KEY", `script "${key}" is set by more than one contribution`);
    }
    setKeys.add(key);
    scripts[key] = edit.set;
    return;
  }
  if (setKeys.has(key)) {
    fail("E-SCRIPT-KEY", `script "${key}" is both set and edited`);
  }
  editKeys.add(key);
  const base = scripts[key];
  if ("prepend" in edit) {
    scripts[key] = base ? `${edit.prepend} && ${base}` : edit.prepend;
  } else {
    scripts[key] = base ? `${base} && ${edit.append}` : edit.append;
  }
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function assertKnownAnchors(
  assembly: RuntimeAssembly[],
  contributions: ContributionSource[],
): void {
  const declared = new Set<string>();
  for (const spec of assembly) for (const name of Object.keys(spec.anchors)) declared.add(name);
  for (const c of contributions) {
    for (const wiring of c.contribution.wiring ?? []) {
      if (!declared.has(wiring.anchor)) {
        fail("E-UNK-ANCHOR", `wiring anchor "${wiring.anchor}" is not declared by any assembly`);
      }
    }
  }
}

function indentLines(lines: string[], indent: string): string[] {
  if (!indent) return lines;
  return lines.map((line) => (line.length === 0 ? "" : indent + line));
}

function collapseBlankLines(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const blank = line.trim() === "";
    if (blank && out.length > 0 && out[out.length - 1].trim() === "") continue;
    out.push(line);
  }
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return `${out.join("\n")}\n`;
}

function addFile(
  outputs: Map<string, { file: VirtualFile; onCollision?: "error" | "identical-ok" }>,
  path: string,
  contents: string,
  source: string,
  onCollision?: "error" | "identical-ok",
): void {
  const existing = outputs.get(path);
  if (existing) {
    const identical = existing.file.contents === contents;
    const forgiving = existing.onCollision === "identical-ok" || onCollision === "identical-ok";
    if (identical && forgiving) return;
    fail("E-FILE-WRITE", `multiple contributions write "${path}"`);
  }
  outputs.set(path, { file: { path, contents, source }, onCollision });
}
