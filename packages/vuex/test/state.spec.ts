import { transformState } from '..'

describe('vuex state', () => {
  it('state', () => {
    const res = transformState(`
    const state = {
        arr: [],
        obj: {
            name: '',
            avatar: '',
        },
        result: null
    }
    `)

    expect(res).toMatchInlineSnapshot(`
      "export const arr = ref([]);
      export const obj = ref({
        name: '',
        avatar: ''
      });
      export const result = ref(null);"
    `)
  })
})
