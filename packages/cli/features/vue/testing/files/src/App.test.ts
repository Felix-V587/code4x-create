// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, test } from 'vitest'

// Self-contained: an inline component that only depends on `vue`, so this test
// stays green whatever optional plugins (router / i18n / UI kit) the project
// has installed.
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
