import { defineConfig } from "vitepress";

const repo = "https://github.com/Felix-V587/code4x-create";
const base = process.env.DOCS_BASE ?? "/";

export default defineConfig({
  lang: "zh-CN",
  title: "code4x",
  titleTemplate: ":title · code4x",
  description: "多框架项目脚手架：Hono / Vue / Electron，开箱即用的 Vite+ 工具链。",
  base,
  cleanUrls: true,
  lastUpdated: true,

  srcExclude: ["**/README.md"],

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo.svg` }],
    ["meta", { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#f7f4ec" }],
    ["meta", { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#14120e" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "code4x" }],
    [
      "meta",
      {
        property: "og:description",
        content: "一条命令创建 Hono / Vue / Electron 项目：22 个可选能力按需勾选，同一组合字节级一致，开箱即用 Vite+ 工具链。",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
    ],
  ],

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "指南", link: "/guide/introduction", activeMatch: "^/guide/" },
      { text: "参考", link: "/reference/features", activeMatch: "^/reference/" },
      { text: "设计文档", link: `${repo}/tree/main/docs` },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "开始",
          items: [
            { text: "介绍", link: "/guide/introduction" },
            { text: "快速开始", link: "/guide/getting-started" },
          ],
        },
        {
          text: "使用",
          items: [
            { text: "CLI 与参数", link: "/guide/cli" },
            { text: "交互式流程", link: "/guide/interactive" },
            { text: "生成后的项目", link: "/guide/generated-project" },
            { text: "在 workspace 中使用", link: "/guide/workspace" },
          ],
        },
        {
          text: "框架",
          items: [
            { text: "Hono", link: "/guide/frameworks/hono" },
            { text: "Vue", link: "/guide/frameworks/vue" },
            { text: "Electron", link: "/guide/frameworks/electron" },
          ],
        },
        {
          text: "组合与排错",
          items: [
            { text: "预设", link: "/guide/presets" },
            { text: "故障排查", link: "/guide/troubleshooting" },
            { text: "FAQ", link: "/guide/faq" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "参考",
          items: [
            { text: "Feature 矩阵", link: "/reference/features" },
            { text: ".code4xrc.json", link: "/reference/rc-file" },
          ],
        },
      ],
    },

    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "搜索文档",
            buttonAriaLabel: "搜索文档",
          },
          modal: {
            noResultsText: "没有找到结果",
            resetButtonTitle: "清除条件",
            footer: {
              selectText: "选择",
              navigateText: "切换",
              closeText: "关闭",
            },
          },
        },
      },
    },

    outline: { level: [2, 3], label: "本页目录" },
    docFooter: { prev: "上一篇", next: "下一篇" },
    darkModeSwitchLabel: "外观",
    sidebarMenuLabel: "目录",
    returnToTopLabel: "回到顶部",
    lastUpdated: { text: "最后更新", formatOptions: { dateStyle: "short", timeStyle: "short" } },

    socialLinks: [{ icon: "github", link: repo }],

    footer: {
      message: "MIT Licensed",
      copyright: "Copyright © 2026 code4x",
    },
  },
});
