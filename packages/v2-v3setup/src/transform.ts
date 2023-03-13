import {
  arrayExpression,
  ArrowFunctionExpression,
  arrowFunctionExpression,
  BlockStatement,
  emptyStatement,
  Expression,
  expressionStatement,
  functionDeclaration,
  Identifier,
  isExpression,
  MemberExpression,
  memberExpression,
  Node,
  objectExpression,
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
  OptionalMemberExpression,
  program,
  StringLiteral,
  stringLiteral
} from '@babel/types'

import {
  callExpression,
  identifier,
  variableDeclaration,
  variableDeclarator
} from '@babel/types'

import { walk } from 'estree-walker'
import { capitalize } from '@vue/shared'

import { BindingTypes, BindingMap, LifecircleHookMap } from './data'

const generate = require('@babel/generator').default

export function transformBindings(
  bindings: BindingMap<any>,
  watcherBindings: BindingMap<any>,
  hookBindings: BindingMap<ObjectMethod>
) {
  const output = []

  function transState(name: string, value: ObjectProperty['value']) {
    return variableDeclaration('const', [
      variableDeclarator(
        identifier(name),
        callExpression(identifier('ref'), [value as any])
      )
    ])
  }

  function transGetters(
    name: string,
    value: BlockStatement | string | Expression
  ) {
    let body
    if (typeof value === 'string') {
      body = arrowFunctionExpression([], stringLiteral(value))
    } else body = transBody(value)

    return variableDeclaration('const', [
      variableDeclarator(
        identifier(name),
        callExpression(identifier('computed'), [
          arrowFunctionExpression([], body)
        ])
      )
    ])
  }

  function transMethod(name: string, func: ObjectMethod) {
    return functionDeclaration(
      identifier(name),
      func.params,
      transBody(func.body),
      func.generator,
      func.async
    )
  }

  function transWatcher(
    name: string,
    value: ObjectExpression | ObjectMethod | StringLiteral
  ) {
    const key = identifier(name)
    const args: (Identifier | Expression)[] = [
      name in bindings ? key : arrowFunctionExpression([], key)
    ]

    let arg2: ArrowFunctionExpression | undefined
    let arg3: ObjectExpression | undefined

    if (value.type === 'ObjectMethod') {
      arg2 = arrowFunctionExpression(
        value.params,
        transBody(value.body),
        value.async
      )
    }

    if (value.type === 'ObjectExpression') {
      const arg3s = []
      for (const prop of value.properties) {
        if (prop.type === 'ObjectMethod') {
          if (prop.key.type === 'Identifier' && prop.key.name === 'handler') {
            arg2 = arrowFunctionExpression(
              prop.params,
              transBody(prop.body),
              prop.async
            )
          }
        }
        if (prop.type === 'ObjectProperty') {
          arg3s.push(prop)
        }
      }
      arg3s.length && (arg3 = objectExpression(arg3s))
    }

    if (value.type === 'StringLiteral') {
      arg2 = arrowFunctionExpression([], stringLiteral(value.value))
    }

    arg2 && args.push(arg2)
    arg3 && args.push(arg3)

    return expressionStatement(callExpression(identifier('watch'), args))
  }

  function transHook(name: string, value: ObjectMethod) {
    if (name in LifecircleHookMap) {
      const id = LifecircleHookMap[name as keyof typeof LifecircleHookMap]
      if (id) {
        const body = transBody(value.body)
        return expressionStatement(
          callExpression(identifier(id), [
            arrowFunctionExpression(value.params, body, value.async)
          ])
        )
      }
      return transBody(value.body)
    }

    return emptyStatement()
  }

  type Ctx = {
    inFuncBody: boolean
    membersCount: number
    members: (MemberExpression | OptionalMemberExpression)[]
    transformedMember?: MemberExpression | OptionalMemberExpression
  }
  function transBody(value: BlockStatement | Expression) {
    const ctx: Ctx = {
      inFuncBody: false,
      membersCount: 0,
      members: []
    }
    const block = (walk as any)(value, {
      enter(child: Node, parent: Node) {
        if (child.type === 'FunctionDeclaration') {
          ctx.inFuncBody = true
        }

        if (isMember(child)) {
          ctx.members?.push(child)
          ctx.membersCount += 1
          const node = transBinding(child, ctx)
          node && this.replace(node)
          if (!ctx.membersCount) this.remove()
        }

        if (child.type === 'CallExpression' && isMember(child.callee)) {
          const { property } = child.callee
          if (property.type === 'Identifier') {
            const evt = child.arguments[0]
            if (property.name === '$emit' && evt.type === 'StringLiteral') {
              const evts: string[] = bindings['emit']?.value || []
              if (!evts.includes(evt.value)) {
                evts.push(evt.value)

                registerBinding(
                  bindings,
                  identifier('emit'),
                  evts,
                  BindingTypes.$
                )
              }
            }
          }
        }
      },
      leave(node: Node) {
        if (node.type === 'FunctionDeclaration') ctx.inFuncBody = false
        if (isMember(node)) {
          ctx.membersCount = Math.max(ctx.membersCount - 1, 0)
          ctx.members.pop()
          if (!ctx.members.length && ctx.transformedMember)
            this.replace(ctx.transformedMember)
        }
      }
    })

    return block
  }

  function transBinding(
    node: MemberExpression | OptionalMemberExpression,
    ctx: Ctx
  ) {
    const { object, property } = node
    if (object.type === 'ThisExpression') {
      if (property.type === 'Identifier') {
        const { name } = property
        if (name in bindings) {
          const { type } = bindings[name]
          if (type === BindingTypes.DATA || type === BindingTypes.COMPUTED)
            return memberExpression(property, identifier('value'))
          if (type === BindingTypes.METHOD || type === BindingTypes.FILTER)
            return property
          if (type === BindingTypes.PROPS) return property
        }

        if (name.startsWith('$')) return trans$(property, ctx)
        if (!ctx.inFuncBody)
          return memberExpression(property, identifier('value'))
      }
    }
  }

  function trans$(property: Identifier, ctx: Ctx) {
    let { name } = property
    name = name.slice(1)
    let id = identifier(name)
    if (name === 'router' || name === 'route') {
      const value = callExpression(identifier(`use${capitalize(name)}`), [])
      registerBinding(bindings, id, value, BindingTypes.$)
      return id
    }
    if (name === 'emit') {
      // registerBinding(bindings, id, [], BindingTypes.$)
      return id
    }
    if (name === 'refs') {
      const { members, membersCount } = ctx
      const idx = membersCount - 1
      const member = members[idx - 1]
      const { property: p } = member
      if (p.type === 'Identifier') {
        const ref = callExpression(identifier('ref'), [])
        registerBinding(bindings, p, ref, BindingTypes.$)
        ctx.transformedMember = restoreMember(members[0], idx)
      }
    }
  }

  for (const [key, { type, value }] of Object.entries(bindings)) {
    if (isOutVar(type)) ''

    if (type === BindingTypes.DATA) output.push(transState(key, value))

    if (type === BindingTypes.COMPUTED) output.push(transGetters(key, value))

    if (type === BindingTypes.METHOD) output.push(transMethod(key, value))
  }

  for (const [key, { value }] of Object.entries(watcherBindings)) {
    output.push(transWatcher(key, value))
  }

  for (const [key, { value }] of Object.entries(hookBindings)) {
    output.push(transHook(key, value))
  }

  for (let [key, { type, value }] of Object.entries(bindings)) {
    if (type === BindingTypes.$) {
      if (key === 'emit') {
        value = callExpression(identifier('defineEmits'), [
          arrayExpression(value.map((v: string) => stringLiteral(v)))
        ])
      }

      output.unshift(
        variableDeclaration('const', [
          variableDeclarator(identifier(key), value)
        ])
      )
    }
  }

  return output.length ? generate(program(output)).code || '' : ''
}

export function isOutVar(type: BindingTypes) {
  return type === BindingTypes.CONST || type === BindingTypes.LET
}

export function registerBinding<T = any>(
  bindings: BindingMap<T>,
  node: Identifier,
  value: T,
  type: BindingTypes
) {
  if (node.name in bindings) {
    const name = node.name
    // const name = (isOutVar(type) ? 'const_' : '') + node.name

    // if (!isOutVar(type) && isOutVar(bindings[node.name].type)) {
    //   bindings['const_' + node.name] = bindings[node.name]
    // }
    bindings[name].type = type
    if (value) bindings[name].value = value
  } else bindings[node.name] = { type, value }
}

export function restoreMember(
  root: MemberExpression | OptionalMemberExpression,
  n: number
): MemberExpression | OptionalMemberExpression | undefined {
  const { object, property, computed, optional } = root

  if (n === 2) {
    if (isMember(object))
      if (object.property.type === 'Identifier')
        return memberExpression(object.property, property, computed, optional)
    if (isExpression(object)) {
      return memberExpression(object, property, computed, optional)
    }
  }

  if (isMember(object)) {
    const obj = restoreMember(object, n - 1)
    if (obj) return memberExpression(obj, property, computed, optional)
  }
}

function isMember(
  node: Node
): node is MemberExpression | OptionalMemberExpression {
  return (
    node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression'
  )
}
