---
"@code4x/cli": patch
---

完善 README 的发布说明，并接入 changesets/action v2 + npm Trusted Publishing（OIDC）自动发布流程：合并 release PR 后自动发布 npm、创建 git tag 与 GitHub Release（无运行时变更）。
