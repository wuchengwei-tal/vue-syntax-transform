import {
  BindingMap,
  BindingTypes,
  isEmptyStmt,
  isMember
} from '@vue-transform/shared'

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
  Node,
  MemberExpression,
  //
  objectProperty,
  identifier,
  stringLiteral,
  objectExpression,
  objectMethod,
  blockStatement,
  returnStatement,
  expressionStatement,
  memberExpression,
  isFunction
} from '@babel/types'

import { walk } from 'estree-walker'

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
  $refs: BindingMap<null>
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

  function transBody(value: BlockStatement | Expression): BlockStatement {
    // @ts-expect-error
    walk(value, {
      enter(child: Node, parent: Node) {
        if (isMember(child)) {
          if (
            child.object.type === 'Identifier' &&
            child.object.name in bindings
          ) {
            let _this: Identifier | MemberExpression = identifier('this')
            if (child.object.name in bindings.$refs) {
              _this = memberExpression(_this, identifier('$refs'))
            }
            if (
              child.property.type === 'Identifier' &&
              child.property.name === 'value'
            ) {
              if (isMember(parent)) {
                child.property.name = child.object.name
                child.object = _this
              } else {
                child.property = identifier(child.object.name)
                child.object = _this
              }
            } else {
              child.object = memberExpression(
                _this,
                identifier(child.object.name)
              )
            }
          }
        }

        if (child.type === 'Identifier') {
          if (['router', 'route', 'emit'].includes(child.name)) {
            child.name = 'this.$' + child.name
          }
          if (['props', '__props'].includes(child.name)) {
            child.name = 'this'
          }
        }
      }
    })

    if (value.type === 'BlockStatement') {
      value.body = value.body.filter(v => !isEmptyStmt(v))
      return value
    } else {
      const stmt = expressionStatement(value)
      return blockStatement(isEmptyStmt(stmt) ? [] : [stmt])
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
    if (body) body = transBody(body)

    return body
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
          transParams(cb.params),
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
      const params = value[0].params

      options.hooks.push(
        objectMethod(
          'method',
          identifier(key),
          transParams(params),
          body,
          false,
          value[0].generator,
          value[0].async
        )
      )
    }
  }

  function transMethod(key: string, value: BindingValue, options: Options) {
    if (!isFunction(value)) return

    const body = normalizeBody(value)

    if (body) {
      options.methods.push(
        objectMethod('method', identifier(key), transParams(value.params), body)
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
    if (!value.length) value[0] = identifier('undefined')
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

function transParams(params: Function['params']) {
  for (const param of params) {
    if ('typeAnnotation' in param) {
      param.typeAnnotation = null
    }
    if ('optional' in param) {
      param.optional = false
    }
  }
  return params as ObjectMethod['params']
}
