import { expect } from 'vitest'
import { BindingTypes } from '../src'
import { compileSFCScript as compile, assertCode, mockId } from './utils'

describe('SFC compile <script setup>', () => {
  test('should expose top level declarations', () => {
    const { content, bindings } = compile(`
      <script setup>
      import { x } from './x'
      let a = 1
      const b = 2
      function c() {}
      class d {}
      </script>

      <script>
      import { xx } from './x'
      let aa = 1
      const bb = 2
      function cc() {}
      class dd {}
      </script>
      `)
    expect(bindings).toStrictEqual({
      x: BindingTypes.SETUP_MAYBE_REF,
      a: BindingTypes.SETUP_LET,
      b: BindingTypes.SETUP_CONST,
      c: BindingTypes.SETUP_CONST,
      d: BindingTypes.SETUP_CONST,
      xx: BindingTypes.SETUP_MAYBE_REF,
      aa: BindingTypes.SETUP_LET,
      bb: BindingTypes.SETUP_CONST,
      cc: BindingTypes.SETUP_CONST,
      dd: BindingTypes.SETUP_CONST
    })
    assertCode(content)
  })

  test('binding analysis for destructure', () => {
    const { content, bindings } = compile(`
      <script setup>
      const { foo, b: bar, ['x' + 'y']: baz, x: { y, zz: { z }}} = {}
      </script>
      `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.SETUP_MAYBE_REF,
      bar: BindingTypes.SETUP_MAYBE_REF,
      baz: BindingTypes.SETUP_MAYBE_REF,
      y: BindingTypes.SETUP_MAYBE_REF,
      z: BindingTypes.SETUP_MAYBE_REF
    })
    assertCode(content)
  })

  test('defineProps()', () => {
    const { content, bindings } = compile(`
<script setup>
const props = defineProps({
  foo: String
})
const bar = 1
</script>
  `)
    // should generate working code
    assertCode(content)
    // should analyze bindings
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS,
      bar: BindingTypes.SETUP_CONST,
      props: BindingTypes.SETUP_REACTIVE_CONST
    })
  })

  test('defineProps w/ external definition', () => {
    const { content } = compile(`
    <script setup>
    import { propsModel } from './props'
    const props = defineProps(propsModel)
    </script>
      `)
    assertCode(content)
  })

  // #4764
  test('defineProps w/ leading code', () => {
    const { content } = compile(`
    <script setup>import { x } from './x'
    const props = defineProps({})
    </script>
    `)
    // props declaration should be inside setup, not moved along with the import
    expect(content).not.toMatch(`const props = __props\nimport`)
    assertCode(content)
  })

  test('defineEmits()', () => {
    const { content, bindings } = compile(`
<script setup>
const myEmit = defineEmits(['foo', 'bar'])
</script>
  `)
    assertCode(content)
    expect(bindings).toStrictEqual({
      myEmit: BindingTypes.SETUP_CONST
    })
  })

  test('defineExpose()', () => {
    const { content } = compile(`
<script setup>
defineExpose({ foo: 123 })
</script>
  `)
    assertCode(content)
  })

  test('<script> after <script setup> the script content not end with `\\n`', () => {
    const { content } = compile(`
    <script setup>
    import { x } from './x'
    </script>
    <script>const n = 1</script>
    `)
    assertCode(content)
  })

  describe('<script> and <script setup> co-usage', () => {
    test('script first', () => {
      const { content } = compile(`
      <script>
      export const n = 1

      export default {}
      </script>
      <script setup>
      import { x } from './x'
      x()
      </script>
      `)
      assertCode(content)
    })

    test('script setup first', () => {
      const { content } = compile(`
      <script setup>
      import { x } from './x'
      x()
      </script>
      <script>
      export const n = 1
      export default {}
      </script>
      `)
      assertCode(content)
    })

    test('script setup first, named default export', () => {
      const { content } = compile(`
      <script setup>
      import { x } from './x'
      x()
      </script>
      <script>
      export const n = 1
      const def = {}
      export { def as default }
      </script>
      `)
      assertCode(content)
    })

    // #4395
    test('script setup first, lang="ts", script block content export default', () => {
      const { content } = compile(`
      <script setup lang="ts">
      import { x } from './x'
      x()
      </script>
      <script lang="ts">
      export default {
        name: "test"
      }
      </script>
      `)
      assertCode(content)
    })

    describe('spaces in ExportDefaultDeclaration node', () => {
      // #4371
      test('with many spaces and newline', () => {
        // #4371
        const { content } = compile(`
        <script>
        export const n = 1
        export        default
        {
          some:'option'
        }
        </script>
        <script setup>
        import { x } from './x'
        x()
        </script>
        `)
        assertCode(content)
      })

      test('with minimal spaces', () => {
        const { content } = compile(`
        <script>
        export const n = 1
        export default{
          some:'option'
        }
        </script>
        <script setup>
        import { x } from './x'
        x()
        </script>
        `)
        assertCode(content)
      })
    })
  })

  describe('imports', () => {
    test('should hoist and expose imports', () => {
      assertCode(
        compile(`<script setup>
          import { ref } from 'vue'
          import 'foo/css'
        </script>`).content
      )
    })

    test('should extract comment for import or type declarations', () => {
      assertCode(
        compile(`
        <script setup>
        import a from 'a' // comment
        import b from 'b'
        </script>
        `).content
      )
    })

    // #2740
    test('should allow defineProps/Emit at the start of imports', () => {
      assertCode(
        compile(`<script setup>
      import { ref } from 'vue'
      defineProps(['foo'])
      defineEmits(['bar'])
      const r = ref(0)
      </script>`).content
      )
    })

    test('dedupe between user & helper', () => {
      const { content } = compile(
        `
      <script setup>
      import { ref } from 'vue'
      let foo = $ref(1)
      </script>
      `,
        { reactivityTransform: true }
      )
      assertCode(content)
      expect(content).toMatch(`import { ref } from 'vue'`)
    })

    test('import dedupe between <script> and <script setup>', () => {
      const { content } = compile(`
        <script>
        import { x } from './x'
        </script>
        <script setup>
        import { x } from './x'
        x()
        </script>
        `)
      assertCode(content)
      expect(content.indexOf(`import { x }`)).toEqual(
        content.lastIndexOf(`import { x }`)
      )
    })

    describe('import ref/reactive function from other place', () => {
      test('import directly', () => {
        const { bindings } = compile(`
        <script setup>
          import { ref, reactive } from './foo'

          const foo = ref(1)
          const bar = reactive(1)
        </script>
      `)
        expect(bindings).toStrictEqual({
          ref: BindingTypes.SETUP_MAYBE_REF,
          reactive: BindingTypes.SETUP_MAYBE_REF,
          foo: BindingTypes.SETUP_MAYBE_REF,
          bar: BindingTypes.SETUP_MAYBE_REF
        })
      })

      test('import w/ alias', () => {
        const { bindings } = compile(`
        <script setup>
          import { ref as _ref, reactive as _reactive } from './foo'

          const foo = ref(1)
          const bar = reactive(1)
        </script>
      `)
        expect(bindings).toStrictEqual({
          _reactive: BindingTypes.SETUP_MAYBE_REF,
          _ref: BindingTypes.SETUP_MAYBE_REF,
          foo: BindingTypes.SETUP_MAYBE_REF,
          bar: BindingTypes.SETUP_MAYBE_REF
        })
      })

      test('aliased usage before import site', () => {
        const { bindings } = compile(`
        <script setup>
          const bar = x(1)
          import { reactive as x } from 'vue'
        </script>
      `)
        expect(bindings).toStrictEqual({
          bar: BindingTypes.SETUP_REACTIVE_CONST,
          x: BindingTypes.SETUP_CONST
        })
      })
    })
  })

  // in dev mode, declared bindings are returned as an object from setup()
  // when using TS, users may import types which should not be returned as
  // values, so we need to check import usage in the template to determine
  // what to be returned.
  describe('dev mode import usage check', () => {
    test('components', () => {
      const { content } = compile(`
        <script setup lang="ts">
        import { FooBar, FooBaz, FooQux, foo } from './x'
        const fooBar: FooBar = 1
        </script>
        <template>
          <FooBaz></FooBaz>
          <foo-qux/>
          <foo/>
          FooBar
        </template>
        `)
      assertCode(content)
    })

    test('directive', () => {
      const { content } = compile(`
        <script setup lang="ts">
        import { vMyDir } from './x'
        </script>
        <template>
          <div v-my-dir></div>
        </template>
        `)
      assertCode(content)
    })

    // https://github.com/vuejs/core/issues/4599
    test('attribute expressions', () => {
      const { content } = compile(`
        <script setup lang="ts">
        import { bar, baz } from './x'
        const cond = true
        </script>
        <template>
          <div :class="[cond ? '' : bar(), 'default']" :style="baz"></div>
        </template>
        `)
      assertCode(content)
    })

    test('vue interpolations', () => {
      const { content } = compile(`
      <script setup lang="ts">
      import { x, y, z, x$y } from './x'
      </script>
      <template>
        <div :id="z + 'y'">{{ x }} {{ yy }} {{ x$y }}</div>
      </template>
      `)
      // x: used in interpolation
      // y: should not be matched by {{ yy }} or 'y' in binding exps
      // x$y: #4274 should escape special chars when creating Regex
      assertCode(content)
    })

    // #4340 interpolations in template strings
    test('js template string interpolations', () => {
      const { content } = compile(`
        <script setup lang="ts">
        import { VAR, VAR2, VAR3 } from './x'
        </script>
        <template>
          {{ \`\${VAR}VAR2\${VAR3}\` }}
        </template>
        `)
      assertCode(content)
    })

    // edge case: last tag in template
    test('last tag', () => {
      const { content } = compile(`
        <script setup lang="ts">
        import { FooBaz, Last } from './x'
        </script>
        <template>
          <FooBaz></FooBaz>
          <Last/>
        </template>
        `)
      assertCode(content)
    })

    test('TS annotations', () => {
      const { content } = compile(`
        <script setup lang="ts">
        import { Foo, Bar, Baz, Qux, Fred } from './x'
        const a = 1
        function b() {}
        </script>
        <template>
          {{ a as Foo }}
          {{ b<Bar>() }}
          {{ Baz }}
          <Comp v-slot="{ data }: Qux">{{ data }}</Comp>
          <div v-for="{ z = x as Qux } in list as Fred"/>
        </template>
        `)
      assertCode(content)
    })

    // vuejs/vue#12591
    test('v-on inline statement', () => {
      // should not error
      compile(`
      <script setup lang="ts">
        import { foo } from './foo'
      </script>
      <template>
        <div @click="$emit('update:a');"></div>
      </template>
      `)
    })
  })

  describe('inlineTemplate mode', () => {
    test('should work', () => {
      const { content } = compile(
        `
        <script setup>
        import { ref } from 'vue'
        const count = ref(0)
        </script>
        <template>
          <div>{{ count }}</div>
          <div>static</div>
        </template>
        `,
        { inlineTemplate: true }
      )
      // check snapshot and make sure helper imports and
      // hoists are placed correctly.
      assertCode(content)
      // in inline mode, no need to call expose() since nothing is exposed
      // anyway!
    })

    test('with defineExpose()', () => {
      const { content } = compile(
        `
        <script setup>
        const count = ref(0)
        defineExpose({ count })
        </script>
        `,
        { inlineTemplate: true }
      )
      assertCode(content)
    })

    test('referencing scope components and directives', () => {
      const { content } = compile(
        `
        <script setup>
        import ChildComp from './Child.vue'
        import SomeOtherComp from './Other.vue'
        import vMyDir from './my-dir'
        </script>
        <template>
          <div v-my-dir></div>
          <ChildComp/>
          <some-other-comp/>
        </template>
        `,
        { inlineTemplate: true }
      )
      assertCode(content)
    })

    test('avoid unref() when necessary', () => {
      // function, const, component import
      const { content } = compile(
        `<script setup>
        import { ref } from 'vue'
        import Foo, { bar } from './Foo.vue'
        import other from './util'
        import * as tree from './tree'
        const count = ref(0)
        const constant = {}
        const maybe = foo()
        let lett = 1
        function fn() {}
        </script>
        <template>
          <Foo>{{ bar }}</Foo>
          <div @click="fn">{{ count }} {{ constant }} {{ maybe }} {{ lett }} {{ other }}</div>
          {{ tree.foo() }}
        </template>
        `,
        { inlineTemplate: true }
      )
      // no need to mark constant fns in patch flag
      expect(content).not.toMatch(`PROPS`)
      assertCode(content)
    })

    test('v-model codegen', () => {
      const { content } = compile(
        `<script setup>
        import { ref } from 'vue'
        const count = ref(0)
        const maybe = foo()
        let lett = 1
        </script>
        <template>
          <input v-model="count">
          <input v-model="maybe">
          <input v-model="lett">
        </template>
        `,
        { inlineTemplate: true }
      )
      assertCode(content)
    })

    test('v-model should not generate ref assignment code for non-setup bindings', () => {
      const { content } = compile(
        `<script setup>
        import { ref } from 'vue'
        const count = ref(0)
        </script>
        <script>
        export default {
          data() { return { foo: 123 } }
        }
        </script>
        <template>
          <input v-model="foo">
        </template>
        `,
        { inlineTemplate: true }
      )
      expect(content).not.toMatch(`_isRef(foo)`)
    })

    test('template assignment expression codegen', () => {
      const { content } = compile(
        `<script setup>
        import { ref } from 'vue'
        const count = ref(0)
        const maybe = foo()
        let lett = 1
        let v = ref(1)
        </script>
        <template>
          <div @click="count = 1"/>
          <div @click="maybe = count"/>
          <div @click="lett = count"/>
          <div @click="v += 1"/>
          <div @click="v -= 1"/>
          <div @click="() => {
              let a = '' + lett
              v = a
           }"/>
           <div @click="() => {
              // nested scopes
              (()=>{
                let x = a
                (()=>{
                  let z = x
                  let z2 = z
                })
                let lz = z
              })
              v = a
           }"/>
        </template>
        `,
        { inlineTemplate: true }
      )
      assertCode(content)
    })

    test('template update expression codegen', () => {
      const { content } = compile(
        `<script setup>
        import { ref } from 'vue'
        const count = ref(0)
        const maybe = foo()
        let lett = 1
        </script>
        <template>
          <div @click="count++"/>
          <div @click="--count"/>
          <div @click="maybe++"/>
          <div @click="--maybe"/>
          <div @click="lett++"/>
          <div @click="--lett"/>
        </template>
        `,
        { inlineTemplate: true }
      )
      assertCode(content)
    })

    test('template destructure assignment codegen', () => {
      const { content } = compile(
        `<script setup>
        import { ref } from 'vue'
        const val = {}
        const count = ref(0)
        const maybe = foo()
        let lett = 1
        </script>
        <template>
          <div @click="({ count } = val)"/>
          <div @click="[maybe] = val"/>
          <div @click="({ lett } = val)"/>
        </template>
        `,
        { inlineTemplate: true }
      )
      assertCode(content)
    })
  })

  describe('with TypeScript', () => {
    test('hoist type declarations', () => {
      const { content } = compile(`
      <script setup lang="ts">
        export interface Foo {}
        type Bar = {}
      </script>`)
      assertCode(content)
    })

    test('defineProps/Emit w/ runtime options', () => {
      const { content } = compile(`
<script setup lang="ts">
const props = defineProps({ foo: String })
const emit = defineEmits(['a', 'b'])
</script>
      `)
      assertCode(content)
    })

    test('defineProps w/ type', () => {
      const { content, bindings } = compile(`
      <script setup lang="ts">
      interface Test {}

      type Alias = number[]

      defineProps<{
        string: string
        number: number
        boolean: boolean
        object: object
        objectLiteral: { a: number }
        fn: (n: number) => void
        functionRef: Function
        objectRef: Object
        dateTime: Date
        array: string[]
        arrayRef: Array<any>
        tuple: [number, number]
        set: Set<string>
        literal: 'foo'
        optional?: any
        recordRef: Record<string, null>
        interface: Test
        alias: Alias
        method(): void
        symbol: symbol

        union: string | number
        literalUnion: 'foo' | 'bar'
        literalUnionNumber: 1 | 2 | 3 | 4 | 5
        literalUnionMixed: 'foo' | 1 | boolean
        intersection: Test & {}
        foo: ((item: any) => boolean) | null
      }>()
      </script>`)
      assertCode(content)
      expect(bindings).toStrictEqual({
        string: BindingTypes.PROPS,
        number: BindingTypes.PROPS,
        boolean: BindingTypes.PROPS,
        object: BindingTypes.PROPS,
        objectLiteral: BindingTypes.PROPS,
        fn: BindingTypes.PROPS,
        functionRef: BindingTypes.PROPS,
        objectRef: BindingTypes.PROPS,
        dateTime: BindingTypes.PROPS,
        array: BindingTypes.PROPS,
        arrayRef: BindingTypes.PROPS,
        tuple: BindingTypes.PROPS,
        set: BindingTypes.PROPS,
        literal: BindingTypes.PROPS,
        optional: BindingTypes.PROPS,
        recordRef: BindingTypes.PROPS,
        interface: BindingTypes.PROPS,
        alias: BindingTypes.PROPS,
        method: BindingTypes.PROPS,
        symbol: BindingTypes.PROPS,
        union: BindingTypes.PROPS,
        literalUnion: BindingTypes.PROPS,
        literalUnionNumber: BindingTypes.PROPS,
        literalUnionMixed: BindingTypes.PROPS,
        intersection: BindingTypes.PROPS,
        foo: BindingTypes.PROPS
      })
    })

    test('defineProps w/ interface', () => {
      const { content, bindings } = compile(`
      <script setup lang="ts">
      interface Props { x?: number }
      defineProps<Props>()
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        x: BindingTypes.PROPS
      })
    })

    test('defineProps w/ extends interface', () => {
      const { content, bindings } = compile(`
      <script lang="ts">
        interface Foo { x?: number }
      </script>
      <script setup lang="ts">
        interface Bar extends Foo { y?: number }
        interface Props extends Bar {
          z: number
          y: string
        }
        defineProps<Props>()
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        x: BindingTypes.PROPS,
        y: BindingTypes.PROPS,
        z: BindingTypes.PROPS
      })
    })

    test('defineProps w/ exported interface', () => {
      const { content, bindings } = compile(`
      <script setup lang="ts">
      export interface Props { x?: number }
      defineProps<Props>()
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        x: BindingTypes.PROPS
      })
    })

    test('defineProps w/ exported interface in normal script', () => {
      const { content, bindings } = compile(`
      <script lang="ts">
        export interface Props { x?: number }
      </script>
      <script setup lang="ts">
        defineProps<Props>()
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        x: BindingTypes.PROPS
      })
    })

    test('defineProps w/ type alias', () => {
      const { content, bindings } = compile(`
      <script setup lang="ts">
      type Props = { x?: number }
      defineProps<Props>()
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        x: BindingTypes.PROPS
      })
    })

    test('defineProps w/ exported type alias', () => {
      const { content, bindings } = compile(`
      <script setup lang="ts">
      export type Props = { x?: number }
      defineProps<Props>()
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        x: BindingTypes.PROPS
      })
    })

    test('withDefaults (static)', () => {
      const { content, bindings } = compile(`
      <script setup lang="ts">
      const props = withDefaults(defineProps<{
        foo?: string
        bar?: number;
        baz: boolean;
        qux?(): number;
        quux?(): void
        quuxx?: Promise<string>;
        fred?: string
      }>(), {
        foo: 'hi',
        qux() { return 1 },
        ['quux']() { },
        async quuxx() { return await Promise.resolve('hi') },
        get fred() { return 'fred' }
      })
      </script>
      `)
      assertCode(content)
      expect(bindings).toStrictEqual({
        foo: BindingTypes.PROPS,
        bar: BindingTypes.PROPS,
        baz: BindingTypes.PROPS,
        qux: BindingTypes.PROPS,
        quux: BindingTypes.PROPS,
        quuxx: BindingTypes.PROPS,
        fred: BindingTypes.PROPS,
        props: BindingTypes.SETUP_CONST
      })
    })

    test('withDefaults (static) + normal script', () => {
      const { content } = compile(`
      <script lang="ts">
        interface Props {
          a?: string;
        }
      </script>
      <script setup lang="ts">
        const props = withDefaults(defineProps<Props>(), {
          a: "a",
        });
      </script>
      `)
      assertCode(content)
    })

    // #7111
    test('withDefaults (static) w/ production mode', () => {
      const { content } = compile(
        `
      <script setup lang="ts">
      const props = withDefaults(defineProps<{
        foo: () => void
        bar: boolean
        baz: boolean | (() => void)
        qux: string | number
      }>(), {
        baz: true,
        qux: 'hi'
      })
      </script>
      `,
        { isProd: true }
      )
      assertCode(content)
    })

    test('withDefaults (dynamic)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      import { defaults } from './foo'
      const props = withDefaults(defineProps<{
        foo?: string
        bar?: number
        baz: boolean
      }>(), { ...defaults })
      </script>
      `)
      assertCode(content)
    })

    // #7111
    test('withDefaults (dynamic) w/ production mode', () => {
      const { content } = compile(
        `
      <script setup lang="ts">
      import { defaults } from './foo'
      const props = withDefaults(defineProps<{
        foo: () => void
        bar: boolean
        baz: boolean | (() => void)
        qux: string | number
      }>(), { ...defaults })
      </script>
      `,
        { isProd: true }
      )
      assertCode(content)
    })

    test('defineEmits w/ type', () => {
      const { content } = compile(`
      <script setup lang="ts">
      const emit = defineEmits<(e: 'foo' | 'bar') => void>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (union)', () => {
      const type = `((e: 'foo' | 'bar') => void) | ((e: 'baz', id: number) => void)`
      expect(() =>
        compile(`
      <script setup lang="ts">
      const emit = defineEmits<${type}>()
      </script>
      `)
      ).toThrow()
    })

    test('defineEmits w/ type (type literal w/ call signatures)', () => {
      const type = `{(e: 'foo' | 'bar'): void; (e: 'baz', id: number): void;}`
      const { content } = compile(`
      <script setup lang="ts">
      const emit = defineEmits<${type}>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (interface)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      interface Emits { (e: 'foo' | 'bar'): void }
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (exported interface)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      export interface Emits { (e: 'foo' | 'bar'): void }
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type from normal script', () => {
      const { content } = compile(`
      <script lang="ts">
        export interface Emits { (e: 'foo' | 'bar'): void }
      </script>
      <script setup lang="ts">
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (type alias)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      type Emits = { (e: 'foo' | 'bar'): void }
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (exported type alias)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      export type Emits = { (e: 'foo' | 'bar'): void }
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (referenced function type)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      type Emits = (e: 'foo' | 'bar') => void
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    test('defineEmits w/ type (referenced exported function type)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      export type Emits = (e: 'foo' | 'bar') => void
      const emit = defineEmits<Emits>()
      </script>
      `)
      assertCode(content)
    })

    // #5393
    test('defineEmits w/ type (interface ts type)', () => {
      const { content } = compile(`
      <script setup lang="ts">
      interface Emits { (e: 'foo'): void }
      const emit: Emits = defineEmits(['foo'])
      </script>
      `)
      assertCode(content)
    })

    test('runtime Enum', () => {
      const { content, bindings } = compile(
        `<script setup lang="ts">
        enum Foo { A = 123 }
        </script>`
      )
      assertCode(content)
      expect(bindings).toStrictEqual({
        Foo: BindingTypes.SETUP_CONST
      })
    })

    test('runtime Enum in normal script', () => {
      const { content, bindings } = compile(
        `<script lang="ts">
          export enum D { D = "D" }
          const enum C { C = "C" }
          enum B { B = "B" }
        </script>
        <script setup lang="ts">
        enum Foo { A = 123 }
        </script>`
      )
      assertCode(content)
      expect(bindings).toStrictEqual({
        D: BindingTypes.SETUP_CONST,
        C: BindingTypes.SETUP_CONST,
        B: BindingTypes.SETUP_CONST,
        Foo: BindingTypes.SETUP_CONST
      })
    })

    test('const Enum', () => {
      const { content, bindings } = compile(
        `<script setup lang="ts">
        const enum Foo { A = 123 }
        </script>`
      )
      assertCode(content)
      expect(bindings).toStrictEqual({
        Foo: BindingTypes.SETUP_CONST
      })
    })

    test('import type', () => {
      const { content } = compile(
        `<script setup lang="ts">
        import type { Foo } from './main.ts'
        import { type Bar, Baz } from './main.ts'
        </script>`
      )
      assertCode(content)
    })
  })

  describe('errors', () => {
    test('<script> and <script setup> must have same lang', () => {
      expect(() =>
        compile(`<script>foo()</script><script setup lang="ts">bar()</script>`)
      ).toThrow(`<script> and <script setup> must have the same language type`)
    })

    const moduleErrorMsg = `cannot contain ES module exports`

    test('non-type named exports', () => {
      expect(() =>
        compile(`<script setup>
        export const a = 1
        </script>`)
      ).toThrow(moduleErrorMsg)

      expect(() =>
        compile(`<script setup>
        export * from './foo'
        </script>`)
      ).toThrow(moduleErrorMsg)

      expect(() =>
        compile(`<script setup>
          const bar = 1
          export { bar as default }
        </script>`)
      ).toThrow(moduleErrorMsg)
    })

    test('defineProps/Emit() w/ both type and non-type args', () => {
      expect(() => {
        compile(`<script setup lang="ts">
        defineProps<{}>({})
        </script>`)
      }).toThrow(`cannot accept both type and non-type arguments`)

      expect(() => {
        compile(`<script setup lang="ts">
        defineEmits<{}>({})
        </script>`)
      }).toThrow(`cannot accept both type and non-type arguments`)
    })

    test('defineProps/Emit() referencing local var', () => {
      expect(() =>
        compile(`<script setup>
        const bar = 1
        defineProps({
          foo: {
            default: () => bar
          }
        })
        </script>`)
      ).toThrow(`cannot reference locally declared variables`)

      expect(() =>
        compile(`<script setup>
        const bar = 'hello'
        defineEmits([bar])
        </script>`)
      ).toThrow(`cannot reference locally declared variables`)

      // #4644
      expect(() =>
        compile(`
        <script>const bar = 1</script>
        <script setup>
        defineProps({
          foo: {
            default: () => bar
          }
        })
        </script>`)
      ).not.toThrow(`cannot reference locally declared variables`)
    })

    test('should allow defineProps/Emit() referencing scope var', () => {
      assertCode(
        compile(`<script setup>
          const bar = 1
          defineProps({
            foo: {
              default: bar => bar + 1
            }
          })
          defineEmits({
            foo: bar => bar > 1
          })
        </script>`).content
      )
    })

    test('should allow defineProps/Emit() referencing imported binding', () => {
      assertCode(
        compile(`<script setup>
        import { bar } from './bar'
        defineProps({
          foo: {
            default: () => bar
          }
        })
        defineEmits({
          foo: () => bar > 1
        })
        </script>`).content
      )
    })
  })
})

describe('SFC analyze <script> bindings', () => {
  it('can parse decorators syntax in typescript block', () => {
    const { scriptAst } = compile(`
      <script lang="ts">
        import { Options, Vue } from 'vue-class-component';
        @Options({
          components: {
            HelloWorld,
          },
          props: ['foo', 'bar']
        })
        export default class Home extends Vue {}
      </script>
    `)

    expect(scriptAst).toBeDefined()
  })

  it('recognizes props array declaration', () => {
    const { bindings } = compile(`
      <script>
        export default {
          props: ['foo', 'bar']
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS,
      bar: BindingTypes.PROPS
    })
    expect(bindings!.__isScriptSetup).toBe(false)
  })

  it('recognizes props object declaration', () => {
    const { bindings } = compile(`
      <script>
        export default {
          props: {
            foo: String,
            bar: {
              type: String,
            },
            baz: null,
            qux: [String, Number]
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.PROPS,
      bar: BindingTypes.PROPS,
      baz: BindingTypes.PROPS,
      qux: BindingTypes.PROPS
    })
    expect(bindings!.__isScriptSetup).toBe(false)
  })

  it('recognizes setup return', () => {
    const { bindings } = compile(`
      <script>
        const bar = 2
        export default {
          setup() {
            return {
              foo: 1,
              bar
            }
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.SETUP_MAYBE_REF,
      bar: BindingTypes.SETUP_MAYBE_REF
    })
    expect(bindings!.__isScriptSetup).toBe(false)
  })

  it('recognizes exported vars', () => {
    const { bindings } = compile(`
      <script>
        export const foo = 2
      </script>
      <script setup>
        console.log(foo)
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.SETUP_CONST
    })
  })

  it('recognizes async setup return', () => {
    const { bindings } = compile(`
      <script>
        const bar = 2
        export default {
          async setup() {
            return {
              foo: 1,
              bar
            }
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.SETUP_MAYBE_REF,
      bar: BindingTypes.SETUP_MAYBE_REF
    })
    expect(bindings!.__isScriptSetup).toBe(false)
  })

  it('recognizes data return', () => {
    const { bindings } = compile(`
      <script>
        const bar = 2
        export default {
          data() {
            return {
              foo: null,
              bar
            }
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.DATA,
      bar: BindingTypes.DATA
    })
  })

  it('recognizes methods', () => {
    const { bindings } = compile(`
      <script>
        export default {
          methods: {
            foo() {}
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({ foo: BindingTypes.OPTIONS })
  })

  it('recognizes computeds', () => {
    const { bindings } = compile(`
      <script>
        export default {
          computed: {
            foo() {},
            bar: {
              get() {},
              set() {},
            }
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.OPTIONS,
      bar: BindingTypes.OPTIONS
    })
  })

  it('recognizes injections array declaration', () => {
    const { bindings } = compile(`
      <script>
        export default {
          inject: ['foo', 'bar']
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.OPTIONS,
      bar: BindingTypes.OPTIONS
    })
  })

  it('recognizes injections object declaration', () => {
    const { bindings } = compile(`
      <script>
        export default {
          inject: {
            foo: {},
            bar: {},
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.OPTIONS,
      bar: BindingTypes.OPTIONS
    })
  })

  it('works for mixed bindings', () => {
    const { bindings } = compile(`
      <script>
        export default {
          inject: ['foo'],
          props: {
            bar: String,
          },
          setup() {
            return {
              baz: null,
            }
          },
          data() {
            return {
              qux: null
            }
          },
          methods: {
            quux() {}
          },
          computed: {
            quuz() {}
          }
        }
      </script>
    `)
    expect(bindings).toStrictEqual({
      foo: BindingTypes.OPTIONS,
      bar: BindingTypes.PROPS,
      baz: BindingTypes.SETUP_MAYBE_REF,
      qux: BindingTypes.DATA,
      quux: BindingTypes.OPTIONS,
      quuz: BindingTypes.OPTIONS
    })
  })

  it('works for script setup', () => {
    const { bindings } = compile(`
      <script setup>
      import { ref as r } from 'vue'
      defineProps({
        foo: String
      })

      const a = r(1)
      let b = 2
      const c = 3
      const { d } = someFoo()
      let { e } = someBar()
      </script>
    `)

    expect(bindings).toStrictEqual({
      r: BindingTypes.SETUP_CONST,
      a: BindingTypes.SETUP_REF,
      b: BindingTypes.SETUP_LET,
      c: BindingTypes.SETUP_CONST,
      d: BindingTypes.SETUP_MAYBE_REF,
      e: BindingTypes.SETUP_LET,
      foo: BindingTypes.PROPS
    })
  })

  describe('auto name inference', () => {
    test('basic', () => {
      const { content } = compile(
        `<script setup>const a = 1</script>
        <template>{{ a }}</template>`,
        undefined,
        {
          filename: 'FooBar.vue'
        }
      )
      assertCode(content)
    })

    test('do not overwrite manual name (object)', () => {
      const { content } = compile(
        `<script>
        export default {
          name: 'Baz'
        }
        </script>
        <script setup>const a = 1</script>
        <template>{{ a }}</template>`,
        undefined,
        {
          filename: 'FooBar.vue'
        }
      )
      expect(content).not.toMatch(`name: 'FooBar'`)
      expect(content).toMatch(`name: 'Baz'`)
      assertCode(content)
    })

    test('do not overwrite manual name (call)', () => {
      const { content } = compile(
        `<script>
        import { defineComponent } from 'vue'
        export default defineComponent({
          name: 'Baz'
        })
        </script>
        <script setup>const a = 1</script>
        <template>{{ a }}</template>`,
        undefined,
        {
          filename: 'FooBar.vue'
        }
      )
      expect(content).not.toMatch(`name: 'FooBar'`)
      expect(content).toMatch(`name: 'Baz'`)
      assertCode(content)
    })
  })
})
