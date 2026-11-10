---
layout: home
title: 多框架项目脚手架

hero:
  name: code4x
  text: 确定性的多框架脚手架
  tagline: 一条命令创建 Hono / Vue / Electron 项目或全栈单仓库：22 个可选能力按需勾选，同一组合字节级一致，开箱即用 Vite+ 工具链。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 浏览 Feature
      link: /reference/features

features:
  - title: 确定性生成
    details: 同一组合、任意勾选顺序，生成的字节完全一致；feature 通过骨架锚点组装，不做字符串替换。
  - title: 三种框架
    details: Hono（标准化后端）、Vue（全家桶 + UI / CSS 套件）、Electron（类型化 IPC + app:// 生产加载）。
  - title: 22 个可选能力
    details: 校验、OpenAPI、日志、测试、请求策略（Query / Colada / Alova）、路由、Tailwind、Reka UI / Naive UI / shadcn-vue、打包等，依赖闭包自动补齐。
  - title: Vite+ 原生
    details: 生成项目直接用 vp dev / build / check / pack；CLI 自身也由 Vite+ 构建与校验。
  - title: 单仓库 / 全栈
    details: 支持在既有 pnpm workspace 内生成、创建单应用 workspace，或一次生成 Hono + Vue + Electron 标准全栈单仓库。
  - title: 三层验证
    details: 离线组合矩阵、blessed 组合构建、服务 / 桌面冒烟；CI 分 PR 与 nightly 两档执行。
---
