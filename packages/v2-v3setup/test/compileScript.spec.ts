import { expect } from 'vitest'

import { BindingTypes } from '../src/data'
import { compileSFCScript as compile, assertCode } from './utils'

describe('SFC compile', () => {
  test('data', () => {
    const { content, bindings } = compile(`
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
      `)

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
    const { content, bindings } = compile(`
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
    `)

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
    const { content, bindings } = compile(`
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
        firstName: 'firstName',
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
    `)

    expect(bindings).toStrictEqual({
      firstName: BindingTypes.DATA,
      lastName: BindingTypes.DATA,
      fullName: BindingTypes.DATA
    })

    expect(content).toMatch('watch(firstName, () => "firstName")')
    expect(content).toMatch('watch(lastName, (v1, v2) => {')
    expect(content).toMatch('watch(fullName, (v1, v2) => {')
    expect(content).toMatch('watch(() => fullName.a, (v1, v2)')

    assertCode(content)
  })

  test('$refs', () => {
    const { content } = compile(`
    <script>
      export default {
        mounted(){
          this.$refs?.listRef.page
        }
      }
    </script>
    `)
    expect(content).toMatch('const listRef = ref()')
    expect(content).toMatch(' listRef.page')
    expect(content).not.toMatch('mounted(')
    expect(content).toMatch('onMounted(()')

    assertCode(content)
  })

  test('router', () => {
    const { content } = compile(`
    <script>
      export default {
        created(){
          this.$route.fullPath
          this.$router.push('/list')
        }
      }
    </script>
    `)
    expect(content).toMatch('const route = useRoute()')
    expect(content).toMatch(' route.fullPath')
    expect(content).toMatch('const router = useRouter()')
    expect(content).toMatch(" router.push('/list');")
    expect(content).not.toMatch('created(')

    assertCode(content)
  })

  test('emit', () => {
    const { content } = compile(`
    <script>
      export default {
        created(){
          this.$emit('click', 0)
          this.$emit('change', 1)
        },
      }
    </script>
    `)

    expect(content).toMatch(`const emit = defineEmits(["click", "change"])`)
    expect(content).toMatch(` emit('click', 0)`)
    expect(content).toMatch(` emit('change', 1)`)

    assertCode(content)
  })

  test('vuex', () => {
    const { content } = compile(`
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
    `)

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
    const { content } = compile(`
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
    `)

    expect(content).not.toMatch(`this.`)
    expect(content).toMatch(`props.prop`)

    assertCode(content)
  })

  test('this', () => {
    const { content } = compile(`
    <script>
      export default {
        mounted(){
          this.a
          const that = this
          ;(function (){
            this.b
            that.c
          })
          function func(){
            this.d
            that.e
          }
        },
      }
    </script>
    `)
    expect(content).toMatch(`this.b`)
    expect(content).toMatch(`this.d`)
    expect(content).not.toMatch(`this.a`)
    expect(content).toMatch(`const a = ref()`)
    assertCode(content)
  })
})
