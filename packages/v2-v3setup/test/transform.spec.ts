import {
  Expression,
  expressionStatement,
  MemberExpression,
  OptionalMemberExpression,
  program
} from '@babel/types'
import { expect } from 'vitest'

import { BindingTypes } from '../src/data'
import { restoreMember } from '../src/transform'

const generate = require('@babel/generator').default

describe('transform ', () => {
  test('restoreMember', () => {
    const member: MemberExpression | OptionalMemberExpression = {
      type: 'OptionalMemberExpression',
      start: 8024,
      end: 8049,
      loc: {
        start: {
          line: 242,
          column: 13
        },
        end: {
          line: 242,
          column: 38
        }
      },
      object: {
        type: 'OptionalMemberExpression',
        start: 8024,
        end: 8043,
        loc: {
          start: {
            line: 242,
            column: 13
          },
          end: {
            line: 242,
            column: 32
          }
        },
        object: {
          type: 'MemberExpression',
          start: 8024,
          end: 8034,
          loc: {
            start: {
              line: 242,
              column: 13
            },
            end: {
              line: 242,
              column: 23
            }
          },
          object: {
            type: 'ThisExpression',
            start: 8024,
            end: 8028,
            loc: {
              start: {
                line: 242,
                column: 13
              },
              end: {
                line: 242,
                column: 17
              }
            }
          },
          computed: false,
          property: {
            type: 'Identifier',
            start: 8029,
            end: 8034,
            loc: {
              start: {
                line: 242,
                column: 18
              },
              end: {
                line: 242,
                column: 23
              }
            },
            name: '$refs'
          }
        },
        computed: false,
        property: {
          type: 'Identifier',
          start: 8036,
          end: 8043,
          loc: {
            start: {
              line: 242,
              column: 25
            },
            end: {
              line: 242,
              column: 32
            }
          },
          name: 'listRef'
        },
        optional: true
      },
      computed: false,
      property: {
        type: 'Identifier',
        start: 8045,
        end: 8049,
        loc: {
          start: {
            line: 242,
            column: 34
          },
          end: {
            line: 242,
            column: 38
          }
        },
        name: 'page'
      },
      optional: true
    }

    const gen = (output?: Expression) => {
      const res =
        output && generate(program([expressionStatement(output)])).code

      return res
    }

    expect(gen(restoreMember(member, 1))).toEqual(undefined)
    expect(gen(restoreMember(member, 2))).toMatch('listRef.page')
    expect(gen(restoreMember(member, 3))).toMatch('$refs.listRef.page')
    expect(gen(restoreMember(member, 4))).toMatch('this.$refs.listRef.page')
    expect(gen(restoreMember(member, 5))).toEqual(undefined)
  })
})
