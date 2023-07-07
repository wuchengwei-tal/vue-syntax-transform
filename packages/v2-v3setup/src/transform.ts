import {
  ArrowFunctionExpression,
  BlockStatement,
  Expression,
  StringLiteral,
  Identifier,
  MemberExpression,
  Node,
  ObjectExpression,
  ObjectMethod,
  OptionalMemberExpression,
  //
  arrayExpression,
  arrowFunctionExpression,
  blockStatement,
  expressionStatement,
  functionDeclaration,
  isExpression,
  memberExpression,
  program,
  objectExpression,
  stringLiteral,
  isFunction
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
    members: [
      Node | undefined,
      ...(MemberExpression | OptionalMemberExpression)[]
    ]
    thisAlias: string[]
  }
  function transBody(value: BlockStatement | Expression): BlockStatement {
    const ctx: Ctx = {
      inFuncBody: false,
      members: [undefined],
      thisAlias: []
    }
    let inMember = false
    ;(walk as any)(value, {
      enter(child: Node, parent: Node) {
        if (isFunction(child)) {
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
          if (inMember === false) ctx.members[0] = parent
          ctx.members?.push(child)
          inMember = true
          const node = transBinding(child, ctx)
          node && this.replace(node)
        } else {
          inMember = false
          ctx.members = [undefined]
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
      leave(child: Node, _parent: Node) {
        if (isFunction(child)) ctx.inFuncBody = false
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

    const { members } = ctx
    const idx = members.length - 2
    const member = members[idx]
    if (name === 'refs' && isMember(member!)) {
      const { property: p } = member
      if (p.type === 'Identifier') {
        const ref = callExpression(identifier('ref'), [])
        registerBinding(bindings, p, ref, BindingTypes.$)
        const transformedMember = restoreMember(members[1], idx)

        if (transformedMember?.type === 'Identifier') {
          members[1].object = members[1].property as Identifier
          members[1].property = identifier('value')
        } else if (transformedMember?.object) {
          members[1].object = memberExpression(
            transformedMember.object,
            identifier('value')
          )
        }
      }
    }
    if (name === 'store') {
      const transformedMember = restoreMember(members[1], idx - 1)
      const parent = members[0]!
      ;(Object.keys(parent) as (keyof Node)[]).forEach(key => {
        const child = parent[key]
        // @ts-expect-error
        if (parent[key]?.start === members[1].start) {
          // @ts-expect-error
          parent[key] = transformedMember
        }
      })
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
