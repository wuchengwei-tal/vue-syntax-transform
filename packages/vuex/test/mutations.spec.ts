import { transformMutations } from '..'

describe('vuex mutations', () => {
  it('mutations', () => {
    const res = transformMutations(`
    export default {
      [types.Mutation](state, data) {
        state.array.push(data);
      },
      mutation(state, data) {
        state.array.push(data);
      }
    }
    `)

    expect(res).toMatchInlineSnapshot(`
      "export function Mutation(data) {
        array.value.push(data);
      }
      export function mutation(data) {
        array.value.push(data);
      }"
    `)
  })
})
