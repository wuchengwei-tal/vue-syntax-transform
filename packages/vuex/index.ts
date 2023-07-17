import { parse } from '@babel/parser'
import {
  Expression,
  FunctionExpression,
  Node,
  ObjectMethod,
  FunctionDeclaration,
  ArrowFunctionExpression,
  //
  variableDeclaration,
  callExpression,
  variableDeclarator,
  identifier,
  program,
  exportNamedDeclaration,
  functionDeclaration
} from '@babel/types'
import { isMember } from '@vue-transform/shared'
import { walk } from 'estree-walker'

const generate = require('@babel/generator').default

export function vuexTransform(code: string, id: string) {
  code = code.replace(/^<script[^>]*>([\s\S]*)<\/script>$/, '$1')

  let content = code
  if (id.endsWith('actions.js')) {
    content = transformActions(code)
  } else if (id.endsWith('mutations.js')) {
    content = transformMutations(code)
  } else if (id.endsWith('index.js') || id.endsWith('state.js')) {
    content = transformState(code)
  } else if (id.endsWith('getters.js')) {
    content = transGetter(code)
  }
  return { content }
}

export function transformState(code: string) {
  const ast = parse(code, { sourceType: 'module' }).program

  const arr = []
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue
    const decl = node.declarations[0]
    if (decl.type !== 'VariableDeclarator') continue
    const { id, init } = decl
    if (id.type !== 'Identifier' || id.name !== 'state') continue
    if (init?.type !== 'ObjectExpression') continue
    for (const prop of init.properties) {
      if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
        prop.value
        const value = prop.value ? [prop.value] : []
        arr.push(
          exportNamedDeclaration(
            variableDeclaration('const', [
              variableDeclarator(
                prop.key,
                callExpression(identifier('ref'), value as Expression[])
              )
            ])
          )
        )
      }
    }
  }

  return generate(program(arr)).code
}

export function transGetter(code: string) {
  const ast = parse(code, { sourceType: 'module' }).program

  const arr = []
  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      let decl = node.declaration
      if (decl?.type === 'FunctionDeclaration') {
        node.declaration = transFunc(decl)
        arr.push(node)
      } else if (decl?.type === 'VariableDeclaration') {
        decl.declarations.forEach(decl => {
          if (decl.init?.type === 'ArrowFunctionExpression') {
            decl.init = callExpression(identifier('computed'), [
              transFunc(decl.init)
            ])
          }
        })
        arr.push(node)
      }
    }
  }
  return generate(program(arr))?.code || code
}

export function transformMutations(code: string) {
  const ast = parse(code, { sourceType: 'module' }).program

  const arr = []

  for (const node of ast.body) {
    if (node.type !== 'ExportDefaultDeclaration') continue
    const { declaration } = node
    if (declaration.type !== 'ObjectExpression') continue

    for (const prop of declaration.properties) {
      if (prop.type === 'ObjectMethod') {
        let name = generate(prop.key)?.code || ''
        if (/types\.\w/.test(name)) name = name.replace('types.', '')
        const id = identifier(name)

        const { params, body } = transFunc(prop)
        const func = functionDeclaration(id, params, body)
        arr.push(exportNamedDeclaration(func))
      }
    }
  }

  return generate(program(arr))?.code || code
}

export function transformActions(code: string) {
  const ast = parse(code, { sourceType: 'module' }).program

  const arr = []

  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      //
    }

    if (node.type === 'ExportNamedDeclaration') {
      let decl = node.declaration
      if (decl?.type === 'FunctionDeclaration') {
        node.declaration = transFunc(decl)
        arr.push(node)
      } else if (decl?.type === 'VariableDeclaration') {
        decl.declarations.forEach(decl => {
          if (decl.init?.type === 'ArrowFunctionExpression') {
            decl.init = transFunc(decl.init)
          }
        })
        arr.push(node)
      }
    }
  }

  return generate(program(arr))?.code || code
}

function transBody(
  node: FunctionExpression['params'][0],
  body: FunctionExpression['body'] | ArrowFunctionExpression['body']
) {
  let names: string[] = []
  let callNames: string[] = []

  if (node.type === 'Identifier') {
    names.push(node.name)
  }

  if (node.type === 'ObjectPattern') {
    node.properties.forEach(prop => {
      if (prop.type === 'ObjectProperty') {
        if (
          prop.value.type === 'Identifier' &&
          prop.key.type === 'Identifier'
        ) {
          if (['dispatch', 'commit'].includes(prop.key.name)) {
            callNames.push(prop.value.name)
          } else if (['state', 'rootState'].includes(prop.key.name)) {
            names.push(prop.value.name)
          }
        }
      }
    })
  }

  names.length + callNames.length &&
    // @ts-expect-error
    walk(body, {
      enter(child: Node) {
        if (isMember(child)) {
          const { object, property } = child
          if (
            object.type === 'Identifier' &&
            names.includes(object.name) &&
            property.type === 'Identifier'
          ) {
            child.object = property
            child.property = identifier('value')
          }
        }

        if (
          child.type === 'CallExpression' &&
          child.callee.type === 'Identifier' &&
          callNames.includes(child.callee.name)
        ) {
          let callee = child.arguments[0]
          if (callee.type === 'StringLiteral') {
            callee = identifier(callee.value)
            // @ts-ignore
            this.replace(callExpression(callee, child.arguments.slice(1)))
          } else if (
            callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier'
          ) {
            callee = identifier(callee.property.name)
            // @ts-ignore
            this.replace(callExpression(callee, child.arguments.slice(1)))
          }
        }
      }
    })

  return body
}

function transFunc<
  T extends
    | FunctionExpression
    | ObjectMethod
    | FunctionDeclaration
    | ArrowFunctionExpression
>(func: T): T {
  let { params, body } = func
  if (params.length > 0) {
    func.body = transBody(params[0], body)
    func.params = params.slice(1)
  }
  return func
}
