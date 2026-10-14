/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

// Vite+ provides the renderer build via its bundled Vite; declare the CSS
// side-effect import locally so `vue-tsc`/`vp check` resolve it without a
// direct `vite` dependency (which would shadow Vite+'s aliased core).
declare module '*.css' {
  const css: string
  export default css
}

interface Code4xApi {
  platform: string
  versions: {
    electron: string
    node: string
    chrome: string
  }
  ping: () => Promise<string>
}

interface Window {
  code4x: Code4xApi
}
