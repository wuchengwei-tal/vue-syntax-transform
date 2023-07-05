import { BindingTypes, assertCode } from '@vue-transform/shared'
import { transform } from '../src'

describe('script transform', () => {
  test('ref', () => {
    const { content, transBindings } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const avatar = ref(img);
const visible = ref(false);
const data = reactive({a:1})
let a = reactive({a:1})
let b = 1
</script>
`)
    assertCode(content)

    if (!transBindings) return
    expect(transBindings['nickname']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['avatar']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['visible']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['data']?.type).toEqual(BindingTypes.DATA)
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
    assertCode(content)

    expect(content).not.toMatch('defineEmits')
    expect(content).not.toMatch('defineProps')
    expect(content).not.toMatch('defineExpose')
    expect(content).not.toMatch('defineOptions')
    expect(content).not.toMatch('expose')
  })

  test('imports', () => {
    const { content } = transform(`
<script lang="ts" setup>
import img from './img.webp';
import Component from './Component.vue';
import { Checkbox } from 'ant-design-vue';
</script>
`)
    assertCode(content)
  })

  test('computed', () => {
    const { content, transBindings } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const name = computed(() => nickname.value);
const age = computed(() => 18);
</script>
`)
    assertCode(content)

    if (!transBindings) return
    expect(transBindings['nickname']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['name']?.type).toEqual(BindingTypes.COMPUTED)
    expect(transBindings['age']?.type).toEqual(BindingTypes.COMPUTED)
  })
  test('methods', () => {
    const { content, transBindings } = transform(`
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
    assertCode(content)

    if (!transBindings) return
    expect(transBindings['nickname']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['name']?.type).toEqual(BindingTypes.COMPUTED)
    expect(transBindings['age']?.type).toEqual(BindingTypes.COMPUTED)
    expect(transBindings['changeName']?.type).toEqual(BindingTypes.METHOD)
    expect(transBindings['changeAge']?.type).toEqual(BindingTypes.METHOD)
  })

  test('watch', () => {
    const { content, transBindings } = transform(`
<script lang="ts" setup>
const nickname = ref('nickname');
const info = reactive({a:1})
const name = computed(() => nickname.value);
const age = computed(() => info.a);

watch(nickname, () => {
  console.log('a changed')
  info.a++
}, { immediate: true, deep: true })

watch(() => info.a, () => {
  console.log('a changed')
  info.a++
}, { immediate: true, deep: true })

watch(() => age, () => {
  console.log('a changed')
  info.a++
}, { immediate: true, deep: true })

watchEffect(()=> {
  info.a++
  console.log('a changed')
})
</script>
`)
    assertCode(content)

    if (!transBindings) return
    expect(transBindings['nickname']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['info']?.type).toEqual(BindingTypes.DATA)
    expect(transBindings['name']?.type).toEqual(BindingTypes.COMPUTED)
    expect(transBindings['age']?.type).toEqual(BindingTypes.COMPUTED)
    expect(transBindings['watch']['nickname']?.type).toEqual(BindingTypes.WATCH)
    expect(transBindings['watch']['age']?.type).toEqual(BindingTypes.WATCH)
    expect(transBindings['watch']['info.a']?.type).toEqual(BindingTypes.WATCH)
    // expect(transBindings['watchEffect']?.type).toEqual(BindingTypes.WATCH)
  })
  test('life cycles hooks', () => {
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
    assertCode(content)
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
    assertCode(content)
  })
})
