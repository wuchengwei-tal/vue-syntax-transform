import { transformActions } from '..'

describe('vuex actions', () => {
  it('actions', () => {
    const res = transformActions(`
export const push = ({ commit, rootState, state, dispatch }, data) => {
  commit(types.Push, data);

  dispatch('push', data);
  rootState.a = 1;
  state.b = 1;
};

/**
 * comment
 */
export const func = ({ commit }, data) => {
  commit(types.Call, data);
};
    `)

    expect(res).toMatchInlineSnapshot(`
      "export const push = data => {
        Push(data);
        push(data);
        a.value = 1;
        b.value = 1;
      };

      /**
       * comment
       */
      export const func = data => {
        Call(data);
      };"
    `)
  })
})
