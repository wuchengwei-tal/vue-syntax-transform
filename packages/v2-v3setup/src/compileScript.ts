import { parse as _parse, ParserOptions, ParserPlugin } from '@babel/parser'
import {
  Node,
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
  Program,
  BlockStatement,
  Identifier,
  StringLiteral,
  Expression,
  Declaration,
  ArrayPattern,
  ObjectPattern,
  identifier
} from '@babel/types'
import {
  SFCDescriptor,
  SFCScriptBlock,
  SFCScriptCompileOptions
} from '@vue/compiler-sfc'
import MagicString from 'magic-string'

import { generateCodeFrame } from '@vue/shared'
import { BindingTypes, BindingMap } from './data'
import { transformBindings, registerBinding } from './transform'

export function compileScript(
  sfc: SFCDescriptor,
  options: SFCScriptCompileOptions
): SFCScriptBlock | any {
  let { script, source } = sfc
  if (!script) return { content: source }

  const plugins: ParserPlugin[] = []
  if (script.lang === 'jsx') {
    plugins.push('jsx')
  } else {
    // If don't match the case of adding jsx, should remove the jsx from the babelParserPlugins
    if (options.babelParserPlugins)
      options.babelParserPlugins = options.babelParserPlugins.filter(
        n => n !== 'jsx'
      )
  }
  if (options.babelParserPlugins) plugins.push(...options.babelParserPlugins)

  plugins.push('typescript')
  if (!plugins.includes('decorators')) {
    plugins.push('decorators-legacy')
  }

  // metadata that needs to be returned
  const bindingMetadata: Record<string, BindingTypes> = {}
  const optionsBindings: BindingMap<any> = Object.create(null)
  const watcherBingings: BindingMap<ObjectProperty['value'] | ObjectMethod> =
    Object.create(null)
  const hookBindings: BindingMap<ObjectMethod> = Object.create(null)

  let sfc_name = ''
  const mixins = []
  const components: { alias?: string; name: string }[] = []
  let defaultExport: Node | undefined
  const s = new MagicString(source)
  const startOffset = script!.loc.start.offset
  const endOffset = script!.loc.end.offset

  function parse(
    input: string,
    options: ParserOptions,
    offset: number
  ): Program {
    try {
      return _parse(input, options).program
    } catch (e: any) {
      e.message = `[@vue/compiler-sfc] ${e.message}\n\n${
        sfc.filename
      }\n${generateCodeFrame(source, e.pos + offset, e.pos + offset + 1)}`
      throw e
    }
  }

  function walkOptions(node: ObjectExpression) {
    for (const property of node.properties) {
      if (property.type !== 'SpreadElement') {
        walkOption(property)
      } else {
        if (property.argument.type == 'ObjectExpression')
          walkOptions(property.argument)
      }
    }
  }

  function walkOption(property: ObjectProperty | ObjectMethod) {
    const { key } = property
    let name = ''
    if (key.type === 'Identifier') name = key.name
    if (key.type === 'StringLiteral') name = key.value
    if (property.type === 'ObjectMethod') {
      if (name === 'data') walkState(optionsBindings, property.body)
      else {
        registerBinding(
          hookBindings,
          identifier(name),
          property,
          BindingTypes.HOOK
        )
      }
    }

    if (property.type === 'ObjectProperty') {
      if (name === 'name' && property.value.type === 'StringLiteral')
        sfc_name = property.value.value

      if (name === 'components') {
        const { value } = property
        if (value.type === 'ObjectExpression') {
          for (const component of value.properties) {
            if (component.type === 'ObjectProperty') {
              const { key, value } = component
              if (key.type === 'Identifier' && value.type === 'Identifier') {
                const { name } = value
                const alias = key.name
                alias === name
                  ? components.push({ name })
                  : components.push({ alias, name })
              }
            }
          }
        }
      }

      if (name === 'mixins') {
        const { value } = property
        if (value.type === 'ArrayExpression') {
          for (const mixin of value.elements) {
            if (mixin?.type === 'Identifier') mixins.push(mixin.name)
          }
        }
      }

      if (name === 'props') walkProps(optionsBindings, property)

      if (name === 'filters')
        walkMethods(optionsBindings, property, BindingTypes.FILTER)

      if (name === 'computed') walkGetter(optionsBindings, property)

      if (name === 'methods')
        walkMethods(optionsBindings, property, BindingTypes.METHOD)

      if (name === 'watch') walkWatches(watcherBingings, property)
    }
  }

  // 0. parse both <script> blocks
  const scriptAst = parse(
    script.content,
    { plugins, sourceType: 'module' },
    startOffset
  )
  if (!scriptAst) return { content: source }

  for (const node of scriptAst.body) {
    if (node.type === 'ImportDeclaration') {
      for (const _specifier of node.specifiers) ''
    }

    if (node.type === 'ExportNamedDeclaration') {
      s.remove(startOffset + node.start!, startOffset + node.end!)
    }

    if (node.type === 'VariableDeclaration') {
      walkDeclaration(node, optionsBindings)
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const { declaration } = node

      if (declaration.type === 'ObjectExpression') {
        walkOptions(declaration)
      }

      // export default
      defaultExport = node
    }
  }

  // . remove non-script content
  if (__TEST__) {
    s.remove(0, startOffset)
    s.remove(endOffset, source.length)
  }

  for (const key in optionsBindings) {
    bindingMetadata[key] = optionsBindings[key].type
  }

  // transform
  const code = transformBindings(optionsBindings, watcherBingings, hookBindings)

  if (defaultExport) {
    s.prependRight(endOffset, code + '\n')
    s.remove(
      startOffset + defaultExport!.start!,
      startOffset + defaultExport!.end!
    )
  }

  s.trim()

  return {
    ...script,
    bindings: bindingMetadata,
    // imports: userImports,
    content: s.toString(),
    // map: genSourceMap
    //   ? (s.generateMap({
    //       source: filename,
    //       hires: true,
    //       includeContent: true
    //     }) as unknown as RawSourceMap)
    //   : undefined,
    scriptAst: scriptAst?.body
  }
}

function walkState(
  bindings: BindingMap<ObjectProperty['value']>,
  block: BlockStatement
) {
  for (const node of block.body) {
    if (node.type === 'ReturnStatement') {
      const { argument } = node
      if (argument?.type === 'ObjectExpression') {
        for (const state of argument.properties) {
          if (state.type === 'ObjectProperty') {
            const { key, value } = state
            if (key.type === 'Identifier')
              registerBinding(bindings, key, value, BindingTypes.DATA)
          }
        }
      }
    }
  }
}

function walkGetter(
  bindings: BindingMap<BlockStatement | string | Expression>,
  computed: ObjectProperty
) {
  if (computed.value.type === 'ObjectExpression') {
    for (const property of computed.value.properties) {
      if (property.type === 'ObjectMethod') {
        const { key, body } = property
        if (key.type === 'Identifier')
          registerBinding(bindings, key, body, BindingTypes.COMPUTED)
      }

      if (property.type === 'ObjectProperty') {
        const { key, value } = property
        if (key.type === 'Identifier') {
          if (
            value.type === 'FunctionExpression' ||
            value.type === 'ArrowFunctionExpression'
          ) {
            registerBinding(bindings, key, value.body, BindingTypes.COMPUTED)
          }
        }
      }

      if (property.type === 'SpreadElement') {
        const { argument } = property
        if (argument.type === 'CallExpression') {
          const { callee } = argument
          if (callee.type === 'Identifier' && callee.name === 'mapGetters') {
            const items = argument.arguments
            if (items.length && items[0].type === 'ObjectExpression') {
              for (const item of items[0].properties) {
                if (item.type !== 'ObjectProperty') continue
                const { key, value } = item
                const val = (value as StringLiteral).value
                if (key.type === 'Identifier')
                  registerBinding(bindings, key, val, BindingTypes.COMPUTED)
              }
            }
          }
        }
      }
    }
  }
}

function walkMethods(
  bindings: BindingMap<ObjectMethod>,
  property: ObjectProperty,
  type: BindingTypes
) {
  const { value } = property
  if (value.type === 'ObjectExpression') {
    for (const func of value.properties) {
      if (func.type === 'ObjectMethod') {
        if (func.key.type === 'Identifier')
          registerBinding(bindings, func.key, func, type)
      }
    }
  }
}

function walkProps(bindings: BindingMap<any>, property: ObjectProperty) {
  const { value } = property
  if (value.type === 'ObjectExpression') {
    if (value.properties.length) {
      const props = property.key as Identifier
      registerBinding(bindings, props, value, BindingTypes.$)
    }
    for (const p of value.properties) {
      if (p.type === 'ObjectProperty') {
        if (p.key.type === 'Identifier')
          registerBinding(bindings, p.key, null, BindingTypes.PROPS)
      }
    }
  }
}

function walkWatches(
  bindings: BindingMap<ObjectProperty['value'] | ObjectMethod>,
  property: ObjectProperty
) {
  const { value } = property
  if (value.type === 'ObjectExpression') {
    for (const watcher of value.properties) {
      if (watcher.type === 'ObjectProperty') {
        const { key, value } = watcher
        if (key.type === 'Identifier')
          registerBinding(bindings, key, value, BindingTypes.WATCH)

        if (key.type === 'StringLiteral') {
          registerBinding(
            bindings,
            identifier(key.value),
            value,
            BindingTypes.WATCH
          )
        }
      }
      if (watcher.type === 'ObjectMethod') {
        if (watcher.key.type === 'Identifier')
          registerBinding(bindings, watcher.key, watcher, BindingTypes.WATCH)
      }
    }
  }
}

function walkDeclaration(node: Declaration, bindings: BindingMap<any>) {
  if (node.type === 'VariableDeclaration') {
    const isConst = node.kind === 'const'
    const bindingType = isConst ? BindingTypes.CONST : BindingTypes.LET
    for (const { id, init } of node.declarations) {
      if (id.type === 'Identifier') {
        registerBinding(bindings, id, init, bindingType)
      }
      if (id.type === 'ObjectPattern') {
        walkObjectPattern(id, bindings, isConst)
      } else if (id.type === 'ArrayPattern') {
        walkArrayPattern(id, bindings, isConst)
      }
    }
  } else if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassDeclaration'
  ) {
    // export function foo() {} / export class Foo {}
    // export declarations must be named.
    registerBinding(bindings, node.id!, node.body, BindingTypes.CONST)
  }
}

function walkObjectPattern(
  node: ObjectPattern,
  bindings: BindingMap<any>,
  isConst: boolean
) {
  for (const p of node.properties) {
    if (p.type === 'ObjectProperty') {
      if (p.key.type === 'Identifier' && p.key === p.value) {
        // shorthand: const { x } = ...
        const type = isConst ? BindingTypes.CONST : BindingTypes.LET
        registerBinding(bindings, p.key, p.value, type)
      } else {
        walkPattern(p.value, bindings, isConst)
      }
    } else {
      // ...rest
      // argument can only be identifier when destructuring
      const type = isConst ? BindingTypes.CONST : BindingTypes.LET
      registerBinding(bindings, p.argument as Identifier, '', type)
    }
  }
}

function walkArrayPattern(
  node: ArrayPattern,
  bindings: BindingMap<any>,
  isConst: boolean
) {
  for (const e of node.elements) {
    e && walkPattern(e, bindings, isConst)
  }
}

function walkPattern(node: Node, bindings: BindingMap<any>, isConst: boolean) {
  if (node.type === 'Identifier') {
    const type = isConst ? BindingTypes.CONST : BindingTypes.LET
    registerBinding(bindings, node, '', type)
  } else if (node.type === 'RestElement') {
    // argument can only be identifier when destructuring
    const type = isConst ? BindingTypes.CONST : BindingTypes.LET
    registerBinding(bindings, node.argument as Identifier, '', type)
  } else if (node.type === 'ObjectPattern') {
    walkObjectPattern(node, bindings, isConst)
  } else if (node.type === 'ArrayPattern') {
    walkArrayPattern(node, bindings, isConst)
  } else if (node.type === 'AssignmentPattern') {
    if (node.left.type === 'Identifier') {
      const type = isConst ? BindingTypes.CONST : BindingTypes.LET
      registerBinding(bindings, node.left, '', type)
    } else {
      walkPattern(node.left, bindings, isConst)
    }
  }
}
