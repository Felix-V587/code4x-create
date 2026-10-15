# vp integration harness

Publish-time verification that the **`vp create code4x`** path works: a local
Vite+ template that shims onto this repo's built CLI, exercised inside a scratch
monorepo (including the monorepo "sub-project" lane).

## Layout

```
fixtures/vp-harness/
  setup.sh   # build the repo CLI + generate the scratch monorepo
  run.sh     # setup + run lanes A/B + observation lane, with assertions
  README.md
```

Nothing here is part of the published package (`vite.config.ts` ignores
`fixtures/**` for lint/fmt).

## Mechanism

`setup.sh <TARGET>` (default `/tmp/opencode/vp-harness`) creates:

- `pnpm-workspace.yaml` → `packages: [apps/*]`
- root `package.json` (private, `type: module`, `devDependencies.vite-plus`)
- root `vite.config.ts` with a local template entry:
  ```ts
  create: { templates: [{ name: "code4x", description: "...", template: "./pkgs/create-code4x" }] }
  ```
- `pkgs/create-code4x/package.json` with `bin.create-code4x` and an
  `index.mjs` shim whose **absolute** path to this repo's
  `packages/cli/dist/cli.mjs` is baked in at generation time.

The shim must **explicitly** `import { run }` and call it:

```js
import { run } from "/abs/path/to/packages/cli/dist/cli.mjs";
process.exit(await run(process.argv.slice(2)));
```

The repo CLI guards its entrypoint with `isMain()` (compares `process.argv[1]`
against its own module URL), so merely importing it has no side effect — the
shim has to invoke `run` itself. `setup.sh` runs `vp pack` inside
`packages/cli/` first so the package's `dist/cli.mjs` exists.

`run.sh` runs, from the scratch monorepo root:

```
vp create code4x --no-interactive --no-hooks --approve-builds -- <pos> <cli args...>
```

vp-level options go **before** `--`; everything after `--` is forwarded verbatim
to our CLI (`--directory` is unavailable for local templates, so the target
directory is passed as a positional). vp does **not** forward
`--no-interactive` to the template — the template still needs `-y` to stay
non-interactive.

## Run

```bash
vp -C packages/cli pack   # or let setup.sh do it
bash fixtures/vp-harness/run.sh                 # default target
bash fixtures/vp-harness/run.sh /tmp/my-target  # custom target
```

or `pnpm run harness:vp`. Logs land in `/tmp/opencode/vp-harness-*.log`.

## Measured results (2026-10-13, Vite+ 1.1.0, pnpm 12.11.2, Node 24.21.0)

Lanes (both exit 0, all assertions pass):

| lane | command (after `--`) | generated at | rc.context |
|---|---|---|---|
| A | `api -f hono --features zod,swagger-openapi -y --no-git` | `<target>/apps/api` | `{nestedWorkspace:true, pmFrom:"env"}` |
| B | `web -f vue -p vue-full -y --no-git` | `<target>/apps/web` | `{nestedWorkspace:true, pmFrom:"env"}` |
| observation | `noapprove -f vue -p vue-full -y --no-git` (no `--approve-builds`) | `<target>/apps/noapprove` | — |

Lane A additionally runs `PORT=3996 pnpm exec vp build` in `apps/api` and
`node dist/index.js`, asserting `GET /openapi.json` → 200 (vp-native template
integration evidence; `assert_build_lane` in `run.sh`).

Observed vp behaviour (after the `src/io/write.ts` fix below):

- **cwd / positional resolution**: vp runs the template with cwd = the inferred
  parent dir (`<target>/apps`, from the `apps/*` pattern), so the positional
  `api` resolves to `<target>/apps/api`. Passing `apps/api` would double-nest.
- **project-dir detection**: `◇ Scaffolded apps/api` and
  `→ Next: cd apps/api && vp run` — vp now sees the final directory (no
  `.code4x-tmp-…`).
- **format**: `● Formatting code...` → succeeds (previously `Format failed`);
  the observation lane logs `● Code formatted`.
- **root install**: executed and succeeded each lane. No
  `ERR_PNPM_IGNORED_BUILDS` was raised — **even without `--approve-builds`**
  (esbuild was already built in the shared store from the root `vite-plus`
  install).
- **root yaml / other rewrites**: vp adds a `catalog:` block to the root
  `pnpm-workspace.yaml` (and no longer accumulates duplicate `apps/*` patterns);
  it writes `AGENTS.md` at the workspace root; it rewrites the generated
  `vite.config.ts` of the vue lanes to `plugins: lazyPlugins(() => [vue()])`
  (importing `lazyPlugins` from `vite-plus`) as part of monorepo integration.
  Root `package.json` is left unchanged.
- **generated project**: no nested `pnpm-workspace.yaml` (context-aware), no
  `@code4x` marker residue, `.code4xrc.json` and `package.json` present after
  vp's post-processing.

## Friction / adaptation notes

1. **Staging dir vs vp's dir detection — fixed.** vp detects the project dir
   from the `package.json` paths the template process writes (shallowest wins).
   Writing `package.json` into `.code4x-tmp-*` made vp target the staging dir,
   so `vp fmt` no-op'd and the `Next: cd …` hint was stale. `src/io/write.ts`
   now writes every non-`package.json` file into staging, renames, and only then
   writes `package.json` into the final target. Trade-off (documented in that
   file): a sub-millisecond post-rename window where the target lacks
   `package.json` on crash.
2. **vp-side rewrites** (root `catalog:`, `AGENTS.md`, `lazyPlugins` in the
   generated `vite.config.ts`) are vp's monorepo integration; nothing to fix on
   our side.
3. **`--json` not applicable here**: vp runs the template non-interactively and
   expects files, so the lanes use the normal (non-json) path.
