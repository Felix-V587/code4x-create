<script setup>
import { withBase } from "vitepress";

const presets = [
  { flag: "-p hono-standard", desc: "标准 Hono 后端" },
  { flag: "-p vue-naive-tw", desc: "Vue + Naive UI + Tailwind" },
  { flag: "-f electron", desc: "类型化 IPC 桌面端" },
];
</script>

<template>
  <section class="c4x-band">
    <div class="c4x-wrap">
      <p class="c4x-kicker" aria-hidden="true">// @code4x:begin quick-start</p>
      <h2 class="c4x-band-title">生成之前，先把计划摊开</h2>
      <p class="c4x-band-lede">
        code4x 先打印完整 Scaffold plan——目标目录、框架、feature、包管理器、install 与 git
        行为——确认无误再落盘。同一组合，无论以什么顺序勾选，字节完全一致。
      </p>

      <figure class="c4x-terminal">
        <figcaption class="c4x-term-bar">
          <span class="c4x-term-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="c4x-term-title">scaffold-plan · bash</span>
        </figcaption>
        <pre class="c4x-term-body"><code><span class="t-c"># 每次生成前打印 Scaffold plan；-y 只跳过交互确认</span>
<span class="t-p">$</span> node packages/cli/dist/cli.mjs my-api -f hono --features zod -y

<span class="t-k">Scaffold plan:</span>
  <span class="t-k">targetDir:</span><span class="t-v">  my-api</span>
  <span class="t-k">package:</span><span class="t-v">    my-api</span>
  <span class="t-k">framework:</span><span class="t-v">  hono</span>
  <span class="t-k">features:</span><span class="t-v">   hono/zod</span>
  <span class="t-k">preset:</span><span class="t-v">     (none)</span>
  <span class="t-k">packageMgr:</span><span class="t-v"> pnpm</span>
  <span class="t-k">install:</span><span class="t-v">    no</span>
  <span class="t-k">git:</span><span class="t-v">        yes</span>

<span class="t-ok">✔</span> Scaffolded hono + hono/zod in my-api  <span class="t-k">(metadata: .code4xrc.json)</span><span class="t-caret" aria-hidden="true"></span></code></pre>
      </figure>

      <ul class="c4x-chips">
        <li v-for="p in presets" :key="p.flag">
          <a class="c4x-chip" :href="withBase('/guide/presets')">
            <code>{{ p.flag }}</code>
            <span class="c4x-chip-desc">{{ p.desc }}</span>
          </a>
        </li>
      </ul>

      <p class="c4x-note">
        当前版本 <code>v0.1.0</code> 尚未发布到 npm，从仓库内构建使用；发布后入口为
        <code>pnpm dlx @code4x/cli</code>。详见<a :href="withBase('/guide/getting-started')">快速开始</a>。
      </p>
    </div>
  </section>
</template>
