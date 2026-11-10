// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, test } from 'vite-plus/test'

// 自包含：内联组件仅依赖 `vue`，因此无论项目安装了哪些可选插件
//（router / i18n / UI 组件库），该测试都能保持通过。
const Counter = defineComponent({
  setup() {
    const count = ref(0)
    return () => h('button', { onClick: () => (count.value += 1) }, `count: ${count.value}`)
  },
})

describe('Counter', () => {
  test('renders and increments on click', async () => {
    const wrapper = mount(Counter)
    expect(wrapper.text()).toBe('count: 0')
    await wrapper.trigger('click')
    expect(wrapper.text()).toBe('count: 1')
  })
})
