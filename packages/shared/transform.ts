import {
  Expression,
  Identifier,
  Statement,
  Node,
  MemberExpression,
  OptionalMemberExpression
} from '@babel/types'

import { BindingTypes, BindingMap } from './const'

export function registerBinding<T = Expression>(
  bindings: BindingMap<T>,
  node: Identifier | string,
  value: T,
  type: BindingTypes
) {
  let name = ''
  if (typeof node === 'string') name = node
  else name = node.name

  if (name in bindings) {
    bindings[name].type = type
    if (value) bindings[name].value = value
  } else bindings[name] = { type, value }
}

export function isEmptyStmt(stmt: Statement) {
  if (stmt.type === 'EmptyStatement') return true
  if (stmt.type === 'ExpressionStatement') return !stmt.expression

  return false
}
export function isMember(
  node: Node
): node is MemberExpression | OptionalMemberExpression {
  return (
    node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression'
  )
}
