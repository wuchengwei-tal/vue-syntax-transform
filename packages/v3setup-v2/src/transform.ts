import { BindingMap, BindingTypes } from '@vue-transform/shared'

import {
  Expression,
  ClassDeclaration,
  FunctionDeclaration,
  Identifier,
  CallExpression,
  ObjectProperty,
  ObjectMethod,
  ObjectExpression,
  BlockStatement,
  Function,
  Statement,
  //
  objectProperty,
  identifier,
  stringLiteral,
  objectExpression,
  objectMethod,
  blockStatement,
  returnStatement,
  expressionStatement,
  isFunction
} from '@babel/types'

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
  watch: ObjectProperty[]
  hooks: ObjectMethod[]
}

export function transformBindings(bindings: TransformBindingsMap) {
  const options: Options = {
    data: [],
    computed: [],
    methods: [],
    watch: [],
    hooks: []
  }

  function transWatcher(key: string, value: BindingValue, options: Options) {
    if (!Array.isArray(value)) return

    const [cb, opts] = value
    if (isFunction(cb)) {
      const body = normalizeBody(cb)
      if (body) {
        const handler = objectMethod(
          'method',
          identifier('handler'),
          cb.params,
          body
        )

        options.watch.push(
          objectProperty(
            key.includes('.') ? stringLiteral(key) : identifier(key),
            objectExpression([
              handler,
              ...(opts as ObjectExpression).properties
            ])
          )
        )
      }
    }
  }

  function transHook(key: string, value: BindingValue, options: Options) {
    if (!Array.isArray(value)) return
    if (!isFunction(value[0])) return

    const body = normalizeBody(value[0])

    if (body) {
      options.hooks.push(
        objectMethod('method', identifier(key), value[0].params, body)
      )
    }
  }

  function transMethod(key: string, value: BindingValue, options: Options) {
    if (!isFunction(value)) return

    const body = normalizeBody(value)

    if (body) {
      options.methods.push(
        objectMethod('method', identifier(key), value.params, body)
      )
    }
  }

  function transGetters(key: string, value: BindingValue, options: Options) {
    if (!Array.isArray(value)) return
    if (!isFunction(value[0])) return
    const body = normalizeBody(value[0], returnStatement)

    if (body) {
      options.computed.push(objectMethod('method', identifier(key), [], body))
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

  if (options.methods.length) {
    output.push(
      objectProperty(identifier('methods'), objectExpression(options.methods))
    )
  }

  if (options.watch.length) {
    output.push(
      objectProperty(identifier('watch'), objectExpression(options.watch))
    )
  }

  output.push(...options.hooks)

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

function normalizeBody(
  node: Function,
  statement: (expr: Expression) => Statement = expressionStatement
) {
  let body: BlockStatement | undefined
  if (node.type === 'ArrowFunctionExpression') {
    if (node.body.type === 'BlockStatement') body = node.body
    else body = blockStatement([statement(node.body)])
  }
  if (
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  ) {
    body = node.body
  }
  return body
}
