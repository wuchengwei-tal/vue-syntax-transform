import {
  arrayExpression,
  ArrowFunctionExpression,
  arrowFunctionExpression,
  blockStatement,
  BlockStatement,
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

import {
  BindingTypes,
  BindingMap,
  registerBinding,
  LifeCircleHookMap,
  isEmptyStmt,
  isMember
} from '@vue-transform/shared'

import { RenderFunction, VModel } from './data'

const generate = require('@babel/generator').default

export function transformBindings(
  bindings: BindingMap<any>,
  watcherBindings: BindingMap<any>,
  hookBindings: BindingMap<ObjectMethod>,
  model: VModel
) {
  const output = []

  function transState(name: string, value?: Expression) {
    return variableDeclaration('const', [
      variableDeclarator(
        identifier(name),
        callExpression(identifier('ref'), value ? [value] : [])
      )
    ])
  }

  function transGetters(
    name: string,
    value: BlockStatement | string | Expression
  ) {
    let body
    if (typeof value === 'string') {
      body = stringLiteral(value)
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
    let { params } = func
    if (name === RenderFunction) {
      const arg1 = params[0]
      if (arg1?.type === 'Identifier' && arg1.name === 'h') {
        params.splice(0, 1)
      }
    }

    return functionDeclaration(
      identifier(name),
      params,
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

    let arg2: ArrowFunctionExpression | Identifier | undefined
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
      arg2 = identifier(value.value)
    }

    arg2 && args.push(arg2)
    arg3 && args.push(arg3)

    return expressionStatement(callExpression(identifier('watch'), args))
  }

  function transHook(name: string, value: ObjectMethod) {
    if (name in LifeCircleHookMap) {
      const id = LifeCircleHookMap[name as keyof typeof LifeCircleHookMap]
      if (id) {
        const body = transBody(value.body)
        if (!body.body.length) return

        return expressionStatement(
          callExpression(identifier(id), [
            arrowFunctionExpression(value.params, body, value.async)
          ])
        )
      }

      const body = transBody(value.body)
      if (body.body.length) {
        return body
      }
    }
  }

  type Ctx = {
    inFuncBody: boolean
    membersCount: number
    members: (MemberExpression | OptionalMemberExpression)[]
    transformedMember?: MemberExpression | OptionalMemberExpression | Identifier
    thisAlias: string[]
  }
  function transBody(value: BlockStatement | Expression): BlockStatement {
    const ctx: Ctx = {
      inFuncBody: false,
      membersCount: 0,
      members: [],
      thisAlias: []
    }
    const block: typeof value = (walk as any)(value, {
      enter(child: Node, _parent: Node) {
        if (
          child.type === 'FunctionDeclaration' ||
          child.type === 'FunctionExpression'
        ) {
          ctx.inFuncBody = true
        }

        if (!ctx.inFuncBody) {
          if (child.type === 'VariableDeclaration') {
            for (const decl of child.declarations) {
              if (
                decl.init?.type === 'ThisExpression' &&
                decl.id.type === 'Identifier'
              ) {
                ctx.thisAlias.push(decl.id.name)
                this.remove()
              }
              if (
                decl.init?.type === 'ArrayExpression' &&
                decl.id.type === 'ArrayPattern'
              ) {
                const idx = decl.init.elements.findIndex(
                  el => el?.type === 'ThisExpression'
                )
                const alias = decl.id.elements[idx]
                if (alias?.type === 'Identifier') {
                  ctx.thisAlias.push(alias.name)
                }
              }
            }
          }
          if (child.type === 'AssignmentExpression') {
            const { left, right } = child
            if (right.type === 'ThisExpression' && left.type === 'Identifier') {
              ctx.thisAlias.push(left.name)
              this.remove()
            }
          }
        }

        if (isMember(child)) {
          ctx.members?.push(child)
          ctx.membersCount += 1
          const node = transBinding(child, ctx)
          node && this.replace(node)
          if (!ctx.membersCount) this.remove()
        }

        if (child.type === 'CallExpression' && isMember(child.callee)) {
          const { property, object } = child.callee
          if (property.type === 'Identifier') {
            const evt = child.arguments[0]
            if (evt?.type === 'StringLiteral') {
              if (property.name === '$emit') {
                const evts: string[] = bindings['emit']?.value || []
                if (!evts.includes(evt.value)) {
                  if (model.event === evt.value) {
                    evt.value = 'update:modelValue'
                  }
                  evts.push(evt.value)

                  registerBinding(
                    bindings,
                    identifier('emit'),
                    evts,
                    BindingTypes.$
                  )
                }
              }

              if (
                isMember(object) &&
                object.property.type === 'Identifier' &&
                object.property.name === '$store'
              ) {
                const { name } = property
                if (name === 'dispatch' || name === 'commit') {
                  const node = callExpression(
                    identifier(evt.value),
                    child.arguments.slice(1)
                  )
                  this.replace(node)
                }
                if (name === 'registerModule' || name === 'unregisterModule') {
                  this.remove()
                }
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

    if (block.type === 'BlockStatement') {
      block.body = block.body.filter(v => !isEmptyStmt(v))
      return block
    } else {
      const stmt = expressionStatement(block)
      return blockStatement(isEmptyStmt(stmt) ? [] : [stmt])
    }
  }

  function transBinding(
    node: MemberExpression | OptionalMemberExpression,
    ctx: Ctx
  ) {
    const { object, property } = node
    const isAlias =
      object.type === 'Identifier' && ctx.thisAlias.includes(object.name)
    if (object.type === 'ThisExpression' || isAlias) {
      if (property.type === 'Identifier') {
        const { name } = property
        if (name in bindings) {
          const { type } = bindings[name]
          if (type === BindingTypes.DATA || type === BindingTypes.COMPUTED)
            return memberExpression(property, identifier('value'))
          if (type === BindingTypes.METHOD || type === BindingTypes.FILTER)
            return property
          if (type === BindingTypes.PROPS) {
            let prop = property
            if (name === model.prop) prop = identifier('modelValue')
            return memberExpression(identifier('props'), prop)
          }
        }

        if (name.startsWith('$')) return trans$(property, ctx)
        if (!(name in bindings))
          if (!ctx.inFuncBody) {
            registerBinding(bindings, property, undefined, BindingTypes.DATA)
            return memberExpression(property, identifier('value'))
          } else if (isAlias) {
            registerBinding(bindings, property, undefined, BindingTypes.DATA)
            return memberExpression(property, identifier('value'))
          }
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
    if (name === 'emit' || name === 'nextTick') return id

    if (name === 'scopedSlots' || name === 'slots') {
      id = identifier('slots')
      registerBinding(
        bindings,
        id,
        callExpression(identifier('useSlots'), []),
        BindingTypes.$
      )
      return id
    }

    const { members, membersCount } = ctx
    const idx = membersCount - 1
    if (name === 'refs') {
      const member = members[idx - 1]
      const { property: p } = member
      if (p.type === 'Identifier') {
        const ref = callExpression(identifier('ref'), [])
        registerBinding(bindings, p, ref, BindingTypes.$)
        ctx.transformedMember = restoreMember(members[0], idx)
      }
    }
    if (name === 'store') {
      ctx.transformedMember = restoreMember(members[0], idx - 1)
    }
  }

  for (const [key, { value }] of Object.entries(watcherBindings)) {
    output.push(transWatcher(key, value))
  }

  for (const [key, { value }] of Object.entries(hookBindings)) {
    const result = transHook(key, value)
    result && output.push(result)
  }

  for (let [key, { type, value }] of Object.entries(bindings)) {
    if ([BindingTypes.METHOD, BindingTypes.FILTER].includes(type))
      output.unshift(transMethod(key, value))
  }

  for (let [key, { type, value }] of Object.entries(bindings)) {
    if (type === BindingTypes.COMPUTED) output.unshift(transGetters(key, value))

    if (type === BindingTypes.DATA) output.unshift(transState(key, value))

    if (type === BindingTypes.$) {
      if (key === 'emit') {
        value = callExpression(identifier('defineEmits'), [
          arrayExpression(value.map((v: string) => stringLiteral(v)))
        ])
      }
      if (key === 'props') {
        value = callExpression(identifier('defineProps'), [value])
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

export function restoreMember(
  root: MemberExpression | OptionalMemberExpression,
  n: number
): MemberExpression | OptionalMemberExpression | Identifier | undefined {
  const { object, property, computed, optional } = root

  if (n === 1) {
    if (property.type === 'Identifier') return property
  }

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
