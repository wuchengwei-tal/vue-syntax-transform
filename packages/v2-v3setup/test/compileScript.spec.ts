import { expect } from 'vitest'

import { BindingTypes } from '../src/data'
import { compileSFCScript as compile, assertCode } from './utils'

describe('SFC compile', () => {
  test('data', () => {
    const { content, bindings } = compile(`
      <script>
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

    assertCode(content)
  })
})
