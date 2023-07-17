import { transGetter } from '..'

describe('vuex getter', () => {
  it('getter', () => {
    const res = transGetter(`
export const get = (state) => {
    return state.a + state.b
}
    `)

    expect(res).toMatchInlineSnapshot(`
      "export const get = computed(() => {
        return a.value + b.value;
      });"
    `)
  })
})
