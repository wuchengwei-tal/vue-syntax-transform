import { transform } from '../src/transform'

describe('script transform', () => {
  test('ref', () => {
    const { content } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const avatar = ref(img);
const visible = ref(false);
</script>
`)

    expect(content).toMatchInlineSnapshot(`
      "export default {
        setup() {

      const nickname = ref('nickname');
      const avatar = ref(img);
      const visible = ref(false);
      }"
    `)
  })

  test('macros', () => {
    const { content } = transform(`
<script lang="ts" setup>
defineEmits(['change']);
defineProps<{a?:number}>()
defineExpose({a:1})
defineOptions({
    name: 'Component',
    inheritAttrs: false,
})
</script>
`)
    expect(content).toMatchInlineSnapshot(`
      "export default {
        ...{
          name: 'Component',
          inheritAttrs: false,
      },
        props: {
          a: { type: Number, required: false }
        },
        emits: ['change'],
        setup() {





      }"
    `)
  })

  test('imports', () => {
    const { content } = transform(`
<script lang="ts" setup>
import img from './img.webp';
import Component from './Component.vue';
import { Checkbox } from 'ant-design-vue';
</script>
`)
    expect(content).toMatchInlineSnapshot(`
      "import img from './img.webp';
      import Component from './Component.vue';
      import { Checkbox } from 'ant-design-vue';

      export default {
        setup() {

      }"
    `)
  })

  test('computed', () => {
    const { content } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const name = computed(() => nickname.value);
const age = computed(() => 18);
</script>
`)
    expect(content).toMatchInlineSnapshot(`
      "export default {
        setup() {

      const nickname = ref('nickname');
      const name = computed(() => nickname.value);
      const age = computed(() => 18);
      }"
    `)
  })
  test('methods', () => {
    const { content } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const name = computed(() => nickname.value);
const age = computed(() => 18);

function changeName() {
  nickname.value = 'new nickname'
}

const changeAge = () => {
  age.value = 20
}
</script>
`)
    expect(content).toMatchInlineSnapshot(`
      "export default {
        setup() {

      const nickname = ref('nickname');
      const name = computed(() => nickname.value);
      const age = computed(() => 18);

      function changeName() {
        nickname.value = 'new nickname'
      }

      const changeAge = () => {
        age.value = 20
      }
      }"
    `)
  })
  test('watch', () => {
    const { content } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const name = computed(() => nickname.value);
const age = computed(() => 18);

watch(a, () => {
  console.log('a changed')
  a.value++
})

watchEffect(()=> {
  a.value++
  console.log('a changed')
})
</script>
`)
    expect(content).toMatchInlineSnapshot(`
      "export default {
        setup() {

      const nickname = ref('nickname');
      const name = computed(() => nickname.value);
      const age = computed(() => 18);

      watch(a, () => {
        console.log('a changed')
        a.value++
      })

      watchEffect(()=> {
        a.value++
        console.log('a changed')
      })
      }"
    `)
  })
  test('life cycles', () => {
    const { content } = transform(`
<script lang="ts" setup>
const a = ref(1)
onMounted(()=> {
  a.value = 2
})

onUnmounted(()=> {
  a.value = 3
})
</script>
`)
    expect(content).toMatchInlineSnapshot(`
      "export default {
        setup() {

      const a = ref(1)
      onMounted(()=> {
        a.value = 2
      })

      onUnmounted(()=> {
        a.value = 3
      })
      }"
    `)
  })

  test('cssVars', () => {
    const { content } = transform(`
<script lang="ts" setup>
const a = ref('1px')
const b = ref(2)
</script>

<style >
div{
  width: v-bind(a);
  height: v-bind(b);
}
</style>
`)

    expect(content).toMatchInlineSnapshot(`
      "export default {
        setup() {

      _useCssVars(_ctx => ({
        \\"-a\\": (_unref(a)),
        \\"-b\\": (_unref(b))
      }))

      const a = ref('1px')
      const b = ref(2)
      }"
    `)
  })
})
