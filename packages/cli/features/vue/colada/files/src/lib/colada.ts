/**
 * Pinia Colada 的全局默认配置（在 `src/main.ts` 中安装）。
 *
 * 将应用级缓存策略放在这里，让各个 `useQuery` 调用只声明
 * 各自特有的部分。
 */
export const coladaOptions = {
  queryOptions: {
    staleTime: 30_000,
  },
}
