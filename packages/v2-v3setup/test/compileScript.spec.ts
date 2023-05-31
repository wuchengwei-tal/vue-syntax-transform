import { expect } from 'vitest'

import { BindingTypes, sfcTransform } from '../src'
import { assertCode } from './utils'

describe('script transform', () => {
  test('data', () => {
    const { content, bindings } = sfcTransform(`
      <script>
      import png from './a.png'
      export default {
        data() {
          return {
            firstName: 'Foo',
            lastName: 'Bar',
            n: 1,
            bool: true,
            obj: {}, 
            timeInterval: null,
            list: [],
            png,
          };
        }
      }
      </script>
      `).script!

    expect(bindings).toStrictEqual({
      firstName: BindingTypes.DATA,
      lastName: BindingTypes.DATA,
      n: BindingTypes.DATA,
      bool: BindingTypes.DATA,
      obj: BindingTypes.DATA,
      timeInterval: BindingTypes.DATA,
      list: BindingTypes.DATA
    })

    expect(content).not.toMatch(`const png = ref`)
    assertCode(content)
  })

  test('computed', () => {
    const { content, bindings } = sfcTransform(`
    <script>
    export default {
      data() {
        return {
          firstName: 'Foo',
          lastName: 'Bar',
        };
      },
      computed: {
        fullName: function () {
          return this.firstName + ' ' + this.lastName
        }
      },
    }
    </script>
    `).script!

    expect(bindings).toStrictEqual({
      firstName: BindingTypes.DATA,
      lastName: BindingTypes.DATA,
      fullName: BindingTypes.COMPUTED
    })

    expect(content).toMatch('const firstName = ref(')
    expect(content).toMatch('const fullName = computed(() => {')

    assertCode(content)
  })

  test('watch', () => {
    const { content, bindings } = sfcTransform(`
    <script>
    export default {
      data() {
        return {
          firstName: 'Foo',
          lastName: 'Bar',
          fullName: {
            a: 1
          },
        };
      },
      watch: {
        firstName: 'onFirstName',
        lastName: {
          handler(v1, v2){
            if(v1 !== v2) {
              this.firstName = 'firstName'
            }
          },
          deep: true,
        },
        fullName(v1, v2) {
          this.firstName = 'fullName'
        },
        'fullName.a' : {
          handler(v1, v2){
          },
        }
      }
    }
    </script>
    `).script!

    expect(bindings).toStrictEqual({
      firstName: BindingTypes.DATA,
      lastName: BindingTypes.DATA,
      fullName: BindingTypes.DATA
    })

    expect(content).toMatch('watch(firstName, onFirstName')
    expect(content).toMatch('watch(lastName, (v1, v2) => {')
    expect(content).toMatch('watch(fullName, (v1, v2) => {')
    expect(content).toMatch('watch(() => fullName.a, (v1, v2)')

    assertCode(content)
  })

  test('$refs', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        mounted(){
          this.$refs?.listRef.page
        }
      }
    </script>
    `).script!
    expect(content).toMatch('const listRef = ref()')
    expect(content).toMatch(' listRef.page')
    expect(content).not.toMatch('mounted(')
    expect(content).toMatch('onMounted(()')

    assertCode(content)
  })

  test('router', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        created(){
          this.$route.fullPath
          this.$router.push('/list')
        }
      }
    </script>
    `).script!
    expect(content).toMatch('const route = useRoute()')
    expect(content).toMatch(' route.fullPath')
    expect(content).toMatch('const router = useRouter()')
    expect(content).toMatch(" router.push('/list');")
    expect(content).not.toMatch('created(')

    assertCode(content)
  })

  test('emit', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        created(){
          this.$emit('click', 0)
          this.$emit('change', 1)
        },
      }
    </script>
    `).script!

    expect(content).toMatch(`const emit = defineEmits(["click", "change"])`)
    expect(content).toMatch(` emit('click', 0)`)
    expect(content).toMatch(` emit('change', 1)`)

    assertCode(content)
  })

  test('vuex', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        created(){
          this.$store.commit('setLoadingState', false);
          this.$store.dispatch('getServerTime');
          this.$store.registerModule('module');
          this.$store.unregisterModule('module');
          const a = this.$store.state.a;
          const b = this.$store.getter.b;
        },
      }
    </script>
    `).script!

    expect(content).not.toMatch(`this.$store`)
    expect(content).not.toMatch(`registerModule`)
    expect(content).not.toMatch(`unregisterModule`)
    expect(content).toMatch(` setLoadingState(false)`)
    expect(content).toMatch(` getServerTime()`)
    expect(content).toMatch(`const a = a`)
    expect(content).toMatch(`const b = b`)

    assertCode(content)
  })

  test('props', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        props: {
          prop: {
            type: Object,
            default: () => {},
          },
          bool: Boolean,
        },
        mounted(){
          this.prop
        },
        
      }
    </script>
    `).script!

    expect(content).not.toMatch(`this.`)
    expect(content).toMatch(`props.prop`)

    assertCode(content)
  })

  test('this', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        mounted(){
          let self
          this.a
          const that = this
          self = this
          that.a
          ;(function (){
            this.b
            that.c
            that.a
            that.e
          })
          function func(){
            this.d
            that.e
          }
        },
      }
    </script>
    `).script!
    expect(content).toMatch(`this.b`)
    expect(content).toMatch(`this.d`)
    expect(content).not.toMatch(`this.a`)
    expect(content).not.toMatch(`that.c`)
    expect(content).not.toMatch(`that.e`)
    expect(content).not.toMatch(`const that = this`)
    expect(content).toMatch(`const a = ref()`)
    expect(content).toMatch(`const c = ref()`)
    expect(content).toMatch(`const e = ref()`)
    assertCode(content)
  })

  test('render prop', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        render(h){
          return h('div')
        },
      }
    </script>
    `).script!

    expect(content).not.toMatch(`render(h) {`)
  })

  test('v-model', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        props: {
          value: String,
        },
        mounted(){
          this.value
          this.$emit('input', 'foo')
        }
      }
    </script>
    `).script!

    expect(content).not.toMatch(`value`)
    expect(content).not.toMatch(`input`)
    expect(content).toMatch(`modelValue`)
    expect(content).toMatch(`update:modelValue`)
  })

  test('custom v-model', () => {
    const { content } = sfcTransform(`
    <script>
      export default {
        model: {
          prop: 'title',
          event: 'change'
        },
        props: {
          value: String,
          title: String,
        },
        mounted(){
          this.title
          this.$emit('change', 'foo')
        }
      }
    </script>
    `).script!

    expect(content).not.toMatch(`title`)
    expect(content).not.toMatch(`change`)
    expect(content).toMatch(`modelValue`)
    expect(content).toMatch(`update:modelValue`)
  })

  test('filter', () => {
    const { content, bindings } = sfcTransform(`
<script>
  export default {
    filters: {
      currencyUSD(value) {
        return '$' + value
      }
    }
  }
</script>
    `).script!

    expect(bindings).toStrictEqual({
      currencyUSD: BindingTypes.FILTER
    })
    expect(content).toMatch(`function currencyUSD`)
  })
})
