# 预设

预设是 `framework + features` 的内容包，用来一次选定常用组合。

| 预设 | 框架 | 展开内容 |
|---|---|---|
| `hono-api` | Hono | api-guard + zod + swagger-openapi |
| `hono-standard` | Hono | api-guard + zod + testing |
| `hono-full` | Hono | standard + swagger-openapi + logging + http-hardening |
| `vue-standard` | Vue | router + pinia + vueuse |
| `vue-naive-tw` | Vue | standard + naive-ui + tailwind（常用推荐） |
| `vue-element-tw` | Vue | standard + element-plus + tailwind |
| `vue-shadcn-tw` | Vue | standard + tailwind + shadcn-vue |
| `vue-unocss-min` | Vue | router + pinia + unocss |
| `vue-full` | Vue | standard + query + testing |

## 使用

```bash
node packages/cli/dist/cli.mjs my-api -p hono-standard -y
node packages/cli/dist/cli.mjs my-web -p vue-naive-tw -y
```

也可以写成 `--template <preset-id>`（兼容别名）：

```bash
node packages/cli/dist/cli.mjs my-web --template vue-naive-tw -y
# note: --template vue-naive-tw -> --preset vue-naive-tw
```

## 与 `--features` 的关系

- 预设只携带 `framework` 与 `features` 两个字段。
- 显式给 `--features` 会**替换**预设的 features，但预设的 framework 仍然生效：

```bash
# 框架仍是 vue，features 只有 router + pinia
node packages/cli/dist/cli.mjs my-web -p vue-naive-tw --features router,pinia -y
```

- 依赖闭包会自动补齐（例如 `swagger-openapi` 带入 `zod`，`shadcn-vue` 带入 `tailwind`）。
- 同组多选（如同时给 naive-ui 与 element-plus）会报 `E-CONFLICT`。

## 自定义组合

预设覆盖不到时，直接列 feature：

```bash
node packages/cli/dist/cli.mjs my-web -f vue \
  --features router,pinia,vueuse,query,testing,tailwind,shadcn-vue -y
```

完整的 id、依赖与互斥关系见 [Feature 矩阵](/reference/features)。
