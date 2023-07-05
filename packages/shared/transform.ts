import { Expression, Identifier } from '@babel/types'

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
