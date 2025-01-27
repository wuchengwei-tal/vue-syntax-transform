import { assertCode, BindingTypes } from '@vue-transform/shared'

import { compileSFCScript as compile } from './utils'

// this file only tests integration with SFC - main test case for the ref
// transform can be found in <root>/packages/reactivity-transform/__tests__
describe('sfc ref transform', () => {
  function compileWithReactivityTransform(src: string) {
    return compile(src, { reactivityTransform: true })
  }

  test('$ unwrapping', () => {
    const { content, bindings } = compileWithReactivityTransform(`<script setup>
      import { ref, shallowRef } from 'vue'
      let foo = $(ref())
      let a = $(ref(1))
      let b = $(shallowRef({
        count: 0
      }))
      let c = () => {}
      let d
      </script>`)
    expect(content).not.toMatch(`$(ref())`)
    expect(content).not.toMatch(`$(ref(1))`)
    expect(content).not.toMatch(`$(shallowRef({`)
    expect(content).toMatch(`const foo = (ref())`)
    expect(content).toMatch(`const a = (ref(1))`)
    expect(content).toMatch(`
      const b = (shallowRef({
        count: 0
      }))
      `)
    // normal declarations left untouched
    expect(content).toMatch(`let c = () => {}`)
    expect(content).toMatch(`let d`)
    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.SETUP_REF,
      a: BindingTypes.SETUP_REF,
      b: BindingTypes.SETUP_REF,
      c: BindingTypes.SETUP_LET,
      d: BindingTypes.SETUP_LET,
      ref: BindingTypes.SETUP_CONST,
      shallowRef: BindingTypes.SETUP_CONST
    })
  })

  test('$ref & $shallowRef declarations', () => {
    const { content, bindings } = compileWithReactivityTransform(`<script setup>
      let foo = $ref()
      let a = $ref(1)
      let b = $shallowRef({
        count: 0
      })
      let c = () => {}
      let d
      </script>`)
    expect(content).not.toMatch(`$ref()`)
    expect(content).not.toMatch(`$ref(1)`)
    expect(content).not.toMatch(`$shallowRef({`)
    expect(content).toMatch(`const foo = ref()`)
    expect(content).toMatch(`const a = ref(1)`)
    expect(content).toMatch(`
      const b = shallowRef({
        count: 0
      })
      `)
    // normal declarations left untouched
    expect(content).toMatch(`let c = () => {}`)
    expect(content).toMatch(`let d`)
    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.SETUP_REF,
      a: BindingTypes.SETUP_REF,
      b: BindingTypes.SETUP_REF,
      c: BindingTypes.SETUP_LET,
      d: BindingTypes.SETUP_LET
    })
  })

  test('usage in normal <script>', () => {
    const { content } = compileWithReactivityTransform(`<script>
      export default {
        setup() {
          let count = $ref(0)
          const inc = () => count++
          return $$({ count })
        }
      }
      </script>`)

    expect(content).not.toMatch(`$ref(0)`)
    expect(content).toMatch(`const count = ref(0)`)
    expect(content).toMatch(`count.value++`)
    expect(content).toMatch(`return ({ count })`)
    assertCode(content)
  })

  test('usage /w typescript', () => {
    const { content } = compileWithReactivityTransform(`
        <script setup lang="ts">
          let msg = $ref<string | number>('foo');
          let bar = $ref <string | number>('bar');
        </script>
      `)
    expect(content).toMatch(`const msg = ref<string | number>('foo')`)
    expect(content).toMatch(`const bar = ref <string | number>('bar')`)
    assertCode(content)
  })

  test('usage with normal <script> + <script setup>', () => {
    const { content, bindings } = compileWithReactivityTransform(`<script>
      let a = $ref(0)
      let c = $ref(0)
      </script>
      <script setup>
      let b = $ref(0)
      let c = 0
      function change() {
        a++
        b++
        c++
      }
      </script>`)

    expect(content).toMatch(`const a = ref(0)`)
    expect(content).toMatch(`const b = ref(0)`)

    // root level ref binding declared in <script> should be inherited in <script setup>
    expect(content).toMatch(`a.value++`)
    expect(content).toMatch(`b.value++`)
    // c shadowed
    expect(content).toMatch(`c++`)
    expect(content).matchSnapshot()
    expect(bindings).toStrictEqual({
      a: BindingTypes.SETUP_REF,
      b: BindingTypes.SETUP_REF,
      c: BindingTypes.SETUP_REF,
      change: BindingTypes.SETUP_CONST
    })
  })

  test('usage with normal <script> (has macro usage) + <script setup> (no macro usage)', () => {
    const { content } = compileWithReactivityTransform(`
      <script>
      let data = $ref()
      </script>
      <script setup>
      console.log(data)
      </script>
      `)
    expect(content).toMatch(`console.log(data.value)`)
    assertCode(content)
  })

  describe('errors', () => {
    test('defineProps/Emit() referencing ref declarations', () => {
      expect(() =>
        compile(
          `<script setup>
          let bar = $ref(1)
          defineProps({
            bar
          })
        </script>`,
          { reactivityTransform: true }
        )
      ).toThrow(`cannot reference locally declared variables`)

      expect(() =>
        compile(
          `<script setup>
          let bar = $ref(1)
          defineEmits({
            bar
          })
        </script>`,
          { reactivityTransform: true }
        )
      ).toThrow(`cannot reference locally declared variables`)
    })
  })
})
