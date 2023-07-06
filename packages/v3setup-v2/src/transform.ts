import { BindingMap, BindingTypes } from '@vue-transform/shared'

import {
  Expression,
  ClassDeclaration,
  FunctionDeclaration,
  Identifier,
  CallExpression,
  ObjectProperty,
  ObjectMethod,
  objectProperty,
  identifier,
  objectExpression,
  objectMethod,
  blockStatement,
  returnStatement
} from '@babel/types'
import { BlockStatement } from '@vue/compiler-dom'

const generate = require('@babel/generator').default

export type BindingValue =
  | Expression
  | ClassDeclaration
  | FunctionDeclaration
  | Identifier
  | CallExpression['arguments']

export type TransformBindingsMap = BindingMap<BindingValue> & {
  watch: BindingMap<BindingValue>
  $hooks: BindingMap<BindingValue>
}

type Options = {
  data: ObjectProperty[]
  computed: (ObjectMethod | ObjectProperty)[]
  methods: ObjectMethod[]
  watch: (ObjectMethod | ObjectProperty)[]
}

export function transformBindings(bindings: TransformBindingsMap) {
  const options: Options = {
    data: [],
    computed: [],
    methods: [],
    watch: []
  }

  function transWatcher(key: string, value: BindingValue, options: Options) {
    // console.log(key, value)
    //
  }

  function transHook(key: string, value: BindingValue, options: Options) {
    // console.log(key, value)
    //
  }

  function transMethod(key: string, value: BindingValue, options: Options) {
    // console.log(key, value)
    //
  }

  function transGetters(key: string, value: BindingValue, options: Options) {
    if (!Array.isArray(value)) return
    const { type } = value[0]

    if (type === 'ArrowFunctionExpression' || type === 'FunctionExpression') {
      const { body } = value[0]
      if (body.type === 'BlockStatement') {
        // options.computed.push(objectMethod('method', identifier(key), [], body))
      } else {
        const block = blockStatement([returnStatement(body)])
        options.computed.push(
          objectMethod('method', identifier(key), [], block)
        )
      }
    }
  }

  for (let [key, { type, value }] of Object.entries(bindings)) {
    if (type === BindingTypes.DATA)
      transState(key, value as BindingValue, options)
    if (type === BindingTypes.COMPUTED)
      transGetters(key, value as BindingValue, options)
    if (type === BindingTypes.METHOD)
      transMethod(key, value as BindingValue, options)

    if (key === 'watch') {
      for (const [key, { value }] of Object.entries(bindings.watch))
        transWatcher(key, value, options)
    }

    if (key === '$hooks') {
      for (const [key, { value }] of Object.entries(bindings.$hooks))
        transHook(key, value, options)
    }
  }

  const output = []

  if (options.data.length) {
    output.push(
      objectMethod(
        'method',
        identifier('data'),
        [],
        blockStatement([returnStatement(objectExpression(options.data))])
      )
    )
  }

  if (options.computed.length) {
    output.push(
      objectProperty(identifier('computed'), objectExpression(options.computed))
    )
  }

  const code: string = output.length
    ? generate(objectExpression(output)).code || ''
    : ''
  const i = code.indexOf('{')
  const j = code.lastIndexOf('}')
  return code.slice(i + 1, j)
}

function transState(key: string, value: BindingValue, options: Options) {
  if (Array.isArray(value)) {
    const { type } = value[0]
    if (
      type === 'SpreadElement' ||
      type === 'JSXNamespacedName' ||
      type === 'ArgumentPlaceholder'
    )
      return
    options.data.push(objectProperty(identifier(key), value[0]))
  } else {
    const { type } = value
    if (type === 'FunctionDeclaration' || type === 'ClassDeclaration') return
    options.data.push(objectProperty(identifier(key), value))
  }
}
