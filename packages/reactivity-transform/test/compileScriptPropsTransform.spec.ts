import { expect } from 'vitest'

import { BindingTypes, SFCScriptCompileOptions } from '../src'
import { compileSFCScript, assertCode } from './utils'

describe('sfc props transform', () => {
  function compile(src: string, options?: Partial<SFCScriptCompileOptions>) {
    return compileSFCScript(src, {
      inlineTemplate: true,
      reactivityTransform: true,
      ...options
    })
  }

  test('basic usage', () => {
    const { content, bindings } = compile(`
      <script setup>
      const { foo } = defineProps(['foo'])
      console.log(foo)
      </script>
      <template>{{ foo }}</template>
    `)

    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS
    })
  })

  test('multiple variable declarations', () => {
    const { content, bindings } = compile(`
      <script setup>
      const bar = 'fish', { foo } = defineProps(['foo']), hello = 'world'
      </script>
      <template><div>{{ foo }} {{ hello }} {{ bar }}</div></template>
    `)
    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS,
      bar: BindingTypes.SETUP_CONST,
      hello: BindingTypes.SETUP_CONST
    })
  })

  test('nested scope', () => {
    const { content, bindings } = compile(`
      <script setup>
      const { foo, bar } = defineProps(['foo', 'bar'])
      function test(foo) {
        console.log(foo)
        console.log(bar)
      }
      </script>
    `)
    expect(content).toMatch(`console.log(foo)`)
    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS,
      bar: BindingTypes.PROPS,
      test: BindingTypes.SETUP_CONST
    })
  })

  test('default values w/ runtime declaration', () => {
    const { content } = compile(`
      <script setup>
      const { foo = 1, bar = {} } = defineProps(['foo', 'bar'])
      </script>
    `)
    assertCode(content)
  })

  test('default values w/ type declaration', () => {
    const { content } = compile(`
      <script setup lang="ts">
      const { foo = 1, bar = {} } = defineProps<{ foo?: number, bar?: object }>()
      </script>
    `)
    assertCode(content)
  })

  test('default values w/ type declaration, prod mode', () => {
    const { content } = compile(
      `
      <script setup lang="ts">
      const { foo = 1, bar = {}, func = () => {} } = defineProps<{ foo?: number, bar?: object, baz?: any, boola?: boolean, boolb?: boolean | number, func?: Function }>()
      </script>
    `,
      { isProd: true }
    )
    assertCode(content)
  })

  test('aliasing', () => {
    const { content, bindings } = compile(`
      <script setup>
      const { foo: bar } = defineProps(['foo'])
      let x = foo
      let y = bar
      </script>
      <template>{{ foo + bar }}</template>
    `)
    expect(content).toMatch(`let x = foo`) // should not process
    assertCode(content)
    expect(bindings).toStrictEqual({
      x: BindingTypes.SETUP_LET,
      y: BindingTypes.SETUP_LET,
      foo: BindingTypes.PROPS,
      bar: BindingTypes.PROPS_ALIASED,
      __propsAliases: {
        bar: 'foo'
      }
    })
  })

  // #5425
  test('non-identifier prop names', () => {
    const { content, bindings } = compile(`
      <script setup>
      const { 'foo.bar': fooBar } = defineProps({ 'foo.bar': Function })
      let x = fooBar
      </script>
      <template>{{ fooBar }}</template>
    `)
    assertCode(content)
    expect(bindings).toStrictEqual({
      x: BindingTypes.SETUP_LET,
      'foo.bar': BindingTypes.PROPS,
      fooBar: BindingTypes.PROPS_ALIASED,
      __propsAliases: {
        fooBar: 'foo.bar'
      }
    })
  })

  test('rest spread', () => {
    const { content, bindings } = compile(`
      <script setup>
      const { foo, bar, ...rest } = defineProps(['foo', 'bar', 'baz'])
      </script>
    `)
    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS,
      bar: BindingTypes.PROPS,
      baz: BindingTypes.PROPS,
      rest: BindingTypes.SETUP_REACTIVE_CONST
    })
  })

  test('$$() escape', () => {
    const { content } = compile(`
      <script setup>
      const { foo, bar: baz } = defineProps(['foo'])
      console.log($$(foo))
      console.log($$(baz))
      $$({ foo, baz })
      </script>
    `)
    expect(content).toMatch(`console.log((foo))`)
    expect(content).toMatch(`console.log((baz))`)
    expect(content).toMatch(`({ foo, baz })`)
    assertCode(content)
  })

  // #6960
  test('computed static key', () => {
    const { content, bindings } = compile(`
    <script setup>
    const { ['foo']: foo } = defineProps(['foo'])
    console.log(foo)
    </script>
    <template>{{ foo }}</template>
  `)
    expect(content).not.toMatch(`const { foo } =`)
    assertCode(content)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS
    })
  })

  describe('errors', () => {
    test('should error on deep destructure', () => {
      expect(() =>
        compile(
          `<script setup>const { foo: [bar] } = defineProps(['foo'])</script>`
        )
      ).toThrow(`destructure does not support nested patterns`)

      expect(() =>
        compile(
          `<script setup>const { foo: { bar } } = defineProps(['foo'])</script>`
        )
      ).toThrow(`destructure does not support nested patterns`)
    })

    test('should error on computed key', () => {
      expect(() =>
        compile(
          `<script setup>const { [foo]: bar } = defineProps(['foo'])</script>`
        )
      ).toThrow(`destructure cannot use computed key`)
    })

    test('should error when used with withDefaults', () => {
      expect(() =>
        compile(
          `<script setup lang="ts">
          const { foo } = withDefaults(defineProps<{ foo: string }>(), { foo: 'foo' })
          </script>`
        )
      ).toThrow(`withDefaults() is unnecessary when using destructure`)
    })

    test('should error if destructure reference local vars', () => {
      expect(() =>
        compile(
          `<script setup>
          const x = 1
          const {
            foo = () => x
          } = defineProps(['foo'])
          </script>`
        )
      ).toThrow(`cannot reference locally declared variables`)
    })

    test('should error if assignment to constant variable', () => {
      expect(() =>
        compile(
          `<script setup>
          const { foo } = defineProps(['foo'])
          foo = 'bar'
          </script>`
        )
      ) //.toThrow(`Assignment to constant variable.`);
    })
  })
})
