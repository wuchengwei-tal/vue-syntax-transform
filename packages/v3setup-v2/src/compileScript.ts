// import * as BindingTypesData from '@vue-transform/shared/binding-types'
import {
  warnOnce,
  DEFAULT_FILENAME,
  BindingTypes,
  registerBinding as register,
  LifeCircleHookMap,
  isMember
} from '@vue-transform/shared'

import {
  ElementNode,
  TemplateChildNode,
  isFunctionType,
  walkIdentifiers
} from '@vue/compiler-dom'
import {
  SFCDescriptor,
  SFCScriptBlock,
  SFCTemplateCompileOptions
} from '@vue/compiler-sfc'
import { ParserPlugin } from '@babel/parser'
import {
  Node,
  Declaration,
  ObjectPattern,
  ArrayPattern,
  Identifier,
  ExportSpecifier,
  Statement,
  CallExpression
} from '@babel/types'
import { walk } from 'estree-walker'
import { RawSourceMap } from 'source-map-js'
import {
  processNormalScript,
  normalScriptDefaultVar
} from './script/normalScript'

import { shouldTransform, transformAST } from '@vue/reactivity-transform'
import { transformDestructuredProps } from './script/definePropsDestructure'
import { ScriptCompileContext } from './script/context'
import {
  processDefineProps,
  genRuntimeProps,
  DEFINE_PROPS,
  WITH_DEFAULTS
} from './script/defineProps'
import { processDefineEmits, DEFINE_EMITS } from './script/defineEmits'
import { DEFINE_EXPOSE, processDefineExpose } from './script/defineExpose'
import { DEFINE_OPTIONS, processDefineOptions } from './script/defineOptions'
import { processDefineSlots } from './script/defineSlots'
import { DEFINE_MODEL, processDefineModel } from './script/defineModel'
import {
  isLiteralNode,
  unwrapTSNode,
  isCallOf,
  getImportedName
} from './script/utils'
import { analyzeScriptBindings } from './script/analyzeScriptBindings'
import { isImportUsed } from './script/importUsageCheck'
import { processAwait } from './script/topLevelAwait'
import { transformBindings, TransformBindingsMap } from './transform'

export interface SFCScriptCompileOptions {
  /**
   * Scope ID for prefixing injected CSS variables.
   * This must be consistent with the `id` passed to `compileStyle`.
   */
  id: string
  /**
   * Production mode. Used to determine whether to generate hashed CSS variables
   */
  isProd?: boolean
  /**
   * Enable/disable source map. Defaults to true.
   */
  sourceMap?: boolean
  /**
   * https://babeljs.io/docs/en/babel-parser#plugins
   */
  babelParserPlugins?: ParserPlugin[]
  /**
   * A list of files to parse for global types to be made available for type
   * resolving in SFC macros. The list must be fully resolved file system paths.
   */
  globalTypeFiles?: string[]
  /**
   * Compile the template and inline the resulting render function
   * directly inside setup().
   * - Only affects `<script setup>`
   * - This should only be used in production because it prevents the template
   * from being hot-reloaded separately from component state.
   */
  inlineTemplate?: boolean
  /**
   * Generate the final component as a variable instead of default export.
   * This is useful in e.g. @vitejs/plugin-vue where the script needs to be
   * placed inside the main module.
   */
  genDefaultAs?: string
  /**
   * Options for template compilation when inlining. Note these are options that
   * would normally be passed to `compiler-sfc`'s own `compileTemplate()`, not
   * options passed to `compiler-dom`.
   */
  templateOptions?: Partial<SFCTemplateCompileOptions>
  /**
   * Hoist <script setup> static constants.
   * - Only enables when one `<script setup>` exists.
   * @default true
   */
  hoistStatic?: boolean
  /**
   * (**Experimental**) Enable macro `defineModel`
   * @default false
   */
  defineModel?: boolean
  /**
   * (**Experimental**) Enable reactive destructure for `defineProps`
   * @default false
   */
  propsDestructure?: boolean
  /**
   * File system access methods to be used when resolving types
   * imported in SFC macros. Defaults to ts.sys in Node.js, can be overwritten
   * to use a virtual file system for use in browsers (e.g. in REPLs)
   */
  fs?: {
    fileExists(file: string): boolean
    readFile(file: string): string | undefined
  }
  /**
   * (Experimental) Enable syntax transform for using refs without `.value` and
   * using destructured props with reactivity
   * @deprecated the Reactivity Transform proposal has been dropped. This
   * feature will be removed from Vue core in 3.4. If you intend to continue
   * using it, disable this and switch to the [Vue Macros implementation](https://vue-macros.sxzz.moe/features/reactivity-transform.html).
   */
  reactivityTransform?: boolean
}

export interface ImportBinding {
  isType: boolean
  imported: string
  local: string
  source: string
  isFromSetup: boolean
  isUsedInTemplate: boolean
}

/**
 * Compile `<script setup>`
 * It requires the whole SFC descriptor because we need to handle and merge
 * normal `<script>` + `<script setup>` if both are present.
 */
export function compileScript(
  sfc: SFCDescriptor,
  options: SFCScriptCompileOptions
): SFCScriptBlock & { transBindings?: TransformBindingsMap } {
  if (!options.id) {
    warnOnce(
      `compileScript now requires passing the \`id\` option.\n` +
        `Upgrade your vite or vue-loader version for compatibility with ` +
        `the latest experimental proposals.`
    )
  }

  const ctx = new ScriptCompileContext(sfc, options)
  const { script, template, scriptSetup, source, filename } = sfc
  const hoistStatic = options.hoistStatic !== false && !script
  const scopeId = options.id ? options.id.replace(/^data-v-/, '') : ''
  const scriptLang = script && script.lang
  const scriptSetupLang = scriptSetup && scriptSetup.lang

  // TODO remove in 3.4
  const enableReactivityTransform = !!options.reactivityTransform
  let refBindings: string[] | undefined

  if (!scriptSetup) {
    if (!script) {
      throw new Error(`[@vue/compiler-sfc] SFC contains no <script> tags.`)
    }
    // normal <script> only
    return processNormalScript(ctx, scopeId)
  }

  if (script && scriptLang !== scriptSetupLang) {
    throw new Error(
      `[@vue/compiler-sfc] <script> and <script setup> must have the same ` +
        `language type.`
    )
  }

  if (scriptSetupLang && !ctx.isJS && !ctx.isTS) {
    // do not process non js/ts script blocks
    return scriptSetup
  }

  // metadata that needs to be returned
  // const ctx.bindingMetadata: BindingMetadata = {}
  const scriptBindings: Record<string, BindingTypes> = Object.create(null)
  const setupBindings: Record<string, BindingTypes> = Object.create(null)
  const transBindings: TransformBindingsMap = Object.create(null)
  transBindings.watch = Object.create(null)
  transBindings.$hooks = Object.create(null)
  transBindings.$refs = Object.create(null)

  let defaultExport: Node | undefined
  let hasAwait = false
  let hasInlinedSsrRenderFn = false

  // string offsets
  const startOffset = ctx.startOffset!
  const endOffset = ctx.endOffset!
  const scriptStartOffset = script && script.loc.start.offset
  const scriptEndOffset = script && script.loc.end.offset

  function hoistNode(node: Statement) {
    const start = node.start! + startOffset
    let end = node.end! + startOffset
    // locate comment
    if (node.trailingComments && node.trailingComments.length > 0) {
      const lastCommentNode =
        node.trailingComments[node.trailingComments.length - 1]
      end = lastCommentNode.end! + startOffset
    }
    // locate the end of whitespace between this statement and the next
    while (end <= source.length) {
      if (!/\s/.test(source.charAt(end))) {
        break
      }
      end++
    }
    ctx.s.move(start, end, 0)
  }

  function registerUserImport(
    source: string,
    local: string,
    imported: string,
    isType: boolean,
    isFromSetup: boolean,
    needTemplateUsageCheck: boolean
  ) {
    // template usage check is only needed in non-inline mode, so we can skip
    // the work if inlineTemplate is true.
    let isUsedInTemplate = needTemplateUsageCheck
    if (
      needTemplateUsageCheck &&
      ctx.isTS &&
      sfc.template &&
      !sfc.template.src &&
      !sfc.template.lang
    ) {
      isUsedInTemplate = isImportUsed(local, sfc)
    }

    ctx.userImports[local] = {
      isType,
      imported,
      local,
      source,
      isFromSetup,
      isUsedInTemplate
    }
  }

  function checkInvalidScopeReference(node: Node | undefined, method: string) {
    if (!node) return
    walkIdentifiers(node, id => {
      const binding = setupBindings[id.name]
      if (binding && binding !== BindingTypes.LITERAL_CONST) {
        ctx.error(
          `\`${method}()\` in <script setup> cannot reference locally ` +
            `declared variables because it will be hoisted outside of the ` +
            `setup() function. If your component options require initialization ` +
            `in the module scope, use a separate normal <script> to export ` +
            `the options instead.`,
          id
        )
      }
    })
  }

  function walkDeclaration(
    from: 'script' | 'scriptSetup',
    node: Declaration,
    bindings: Record<string, BindingTypes>,
    userImportAliases: Record<string, string>,
    hoistStatic: boolean
  ): boolean {
    let isAllLiteral = false

    if (node.type === 'VariableDeclaration') {
      const isConst = node.kind === 'const'
      isAllLiteral =
        isConst &&
        node.declarations.every(
          decl => decl.id.type === 'Identifier' && isStaticNode(decl.init!)
        )

      // export const foo = ...
      for (const { id, init: _init } of node.declarations) {
        const init = _init && unwrapTSNode(_init)
        const isDefineCall = !!(
          isConst &&
          isCallOf(
            init,
            c => c === DEFINE_PROPS || c === DEFINE_EMITS || c === WITH_DEFAULTS
          )
        )
        if (id.type === 'Identifier') {
          let bindingType
          const userReactiveBinding = userImportAliases['reactive']
          if (
            (hoistStatic || from === 'script') &&
            (isAllLiteral || (isConst && isStaticNode(init!)))
          ) {
            bindingType = BindingTypes.LITERAL_CONST
          } else if (isCallOf(init, userReactiveBinding)) {
            // treat reactive() calls as let since it's meant to be mutable
            bindingType = isConst
              ? BindingTypes.SETUP_REACTIVE_CONST
              : BindingTypes.SETUP_LET

            register(transBindings, id, init.arguments, BindingTypes.DATA)
            ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
          } else if (
            // if a declaration is a const literal, we can mark it so that
            // the generated render fn code doesn't need to unref() it
            isDefineCall ||
            (isConst && canNeverBeRef(init!, userReactiveBinding))
          ) {
            bindingType = isCallOf(init, DEFINE_PROPS)
              ? BindingTypes.SETUP_REACTIVE_CONST
              : BindingTypes.SETUP_CONST

            if (
              init?.type === 'ArrowFunctionExpression' ||
              init?.type === 'FunctionExpression'
            ) {
              register(transBindings, id, init, BindingTypes.METHOD)
              ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
            }
          } else if (isConst) {
            if (
              isCallOf(
                init,
                m =>
                  m === userImportAliases['ref'] ||
                  m === userImportAliases['computed'] ||
                  m === userImportAliases['shallowRef'] ||
                  m === userImportAliases['customRef'] ||
                  m === userImportAliases['toRef'] ||
                  m === DEFINE_MODEL
              )
            ) {
              bindingType = BindingTypes.SETUP_REF

              const args = (init as CallExpression)?.arguments || []
              let type = BindingTypes.DATA
              if (isCallOf(init, m => m === userImportAliases['computed']))
                type = BindingTypes.COMPUTED

              register(transBindings, id, args, type)
              ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
            } else {
              bindingType = BindingTypes.SETUP_MAYBE_REF
              if (isCallOf(init, 'useRouter') || isCallOf(init, 'useRoute')) {
                ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
              }
            }
          } else {
            bindingType = BindingTypes.SETUP_LET
          }
          registerBinding(bindings, id, bindingType)
        } else {
          if (isCallOf(init, DEFINE_PROPS)) {
            continue
          }
          if (id.type === 'ObjectPattern') {
            walkObjectPattern(id, bindings, isConst, isDefineCall)
          } else if (id.type === 'ArrayPattern') {
            walkArrayPattern(id, bindings, isConst, isDefineCall)
          }
        }
      }
    } else if (node.type === 'TSEnumDeclaration') {
      isAllLiteral = node.members.every(
        member => !member.initializer || isStaticNode(member.initializer)
      )
      bindings[node.id!.name] = isAllLiteral
        ? BindingTypes.LITERAL_CONST
        : BindingTypes.SETUP_CONST
    } else if (node.type === 'FunctionDeclaration') {
      // export function foo() {} / export class Foo {}
      // export declarations must be named.
      bindings[node.id!.name] = BindingTypes.SETUP_CONST

      register(transBindings, node.id!, node, BindingTypes.METHOD)
      ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
    } else if (node.type === 'ClassDeclaration') {
      bindings[node.id!.name] = BindingTypes.SETUP_CONST
      hoistNode(node)
    }

    return isAllLiteral
  }

  const scriptAst = ctx.scriptAst
  const scriptSetupAst = ctx.scriptSetupAst!

  // 1.1 walk import declarations of <script>
  if (scriptAst) {
    for (const node of scriptAst.body) {
      if (node.type === 'ImportDeclaration') {
        // record imports for dedupe
        for (const specifier of node.specifiers) {
          const imported = getImportedName(specifier)
          registerUserImport(
            node.source.value,
            specifier.local.name,
            imported,
            node.importKind === 'type' ||
              (specifier.type === 'ImportSpecifier' &&
                specifier.importKind === 'type'),
            false,
            !options.inlineTemplate
          )
        }
      }
    }
  }

  // 1.2 walk import declarations of <script setup>
  for (const node of scriptSetupAst.body) {
    if (node.type === 'ImportDeclaration') {
      // import declarations are moved to top
      hoistNode(node)

      // dedupe imports
      let removed = 0
      const removeSpecifier = (i: number) => {
        const removeLeft = i > removed
        removed++
        const current = node.specifiers[i]
        const next = node.specifiers[i + 1]
        ctx.s.remove(
          removeLeft
            ? node.specifiers[i - 1].end! + startOffset
            : current.start! + startOffset,
          next && !removeLeft
            ? next.start! + startOffset
            : current.end! + startOffset
        )
      }

      for (let i = 0; i < node.specifiers.length; i++) {
        const specifier = node.specifiers[i]
        const local = specifier.local.name
        const imported = getImportedName(specifier)
        const source = node.source.value
        const existing = ctx.userImports[local]
        if (
          source === 'vue' &&
          (imported === DEFINE_PROPS ||
            imported === DEFINE_EMITS ||
            imported === DEFINE_EXPOSE)
        ) {
          warnOnce(
            `\`${imported}\` is a compiler macro and no longer needs to be imported.`
          )
          removeSpecifier(i)
        } else if (existing) {
          if (existing.source === source && existing.imported === imported) {
            // already imported in <script setup>, dedupe
            removeSpecifier(i)
          } else {
            ctx.error(
              `different imports aliased to same local name.`,
              specifier
            )
          }
        } else {
          registerUserImport(
            source,
            local,
            imported,
            node.importKind === 'type' ||
              (specifier.type === 'ImportSpecifier' &&
                specifier.importKind === 'type'),
            true,
            !options.inlineTemplate
          )
        }
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.importKind === 'type'
        ) {
          removeSpecifier(i)
        }
      }
      if (node.specifiers.length && removed === node.specifiers.length) {
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      }

      if (node.importKind === 'type') {
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      }
    }
  }

  // 1.3 resolve possible user import alias of `ref` and `reactive`
  const vueImportAliases: Record<string, string> = {
    ref: 'ref',
    reactive: 'reactive',
    computed: 'computed',
    shallowRef: 'shallowRef',
    customRef: 'customRef',
    watch: 'watch',
    watchEffect: 'watchEffect',
    toRef: 'toRef'
  }
  for (const key in ctx.userImports) {
    const { source, imported, local } = ctx.userImports[key]
    if (source === 'vue') vueImportAliases[imported] = local
  }

  // 1.4 template reference bindings
  template && walkTemplate(template.ast, transBindings)

  // 2.1 process normal <script> body
  if (script && scriptAst) {
    for (const node of scriptAst.body) {
      if (node.type === 'ExportDefaultDeclaration') {
        // export default
        defaultExport = node

        // check if user has manually specified `name` or 'render` option in
        // export default
        // if has name, skip name inference
        // if has render and no template, generate return object instead of
        // empty render function (#4980)
        let optionProperties
        if (defaultExport.declaration.type === 'ObjectExpression') {
          optionProperties = defaultExport.declaration.properties
        } else if (
          defaultExport.declaration.type === 'CallExpression' &&
          defaultExport.declaration.arguments[0] &&
          defaultExport.declaration.arguments[0].type === 'ObjectExpression'
        ) {
          optionProperties = defaultExport.declaration.arguments[0].properties
        }
        if (optionProperties) {
          for (const p of optionProperties) {
            if (
              p.type === 'ObjectProperty' &&
              p.key.type === 'Identifier' &&
              p.key.name === 'name'
            ) {
              ctx.hasDefaultExportName = true
            }
            if (
              (p.type === 'ObjectMethod' || p.type === 'ObjectProperty') &&
              p.key.type === 'Identifier' &&
              p.key.name === 'render'
            ) {
              // TODO warn when we provide a better way to do it?
              ctx.hasDefaultExportRender = true
            }
          }
        }

        // export default { ... } --> const __default__ = { ... }
        const start = node.start! + scriptStartOffset!
        const end = node.declaration.start! + scriptStartOffset!
        ctx.s.overwrite(start, end, `const ${normalScriptDefaultVar} = `)
      } else if (node.type === 'ExportNamedDeclaration') {
        const defaultSpecifier = node.specifiers.find(
          s => s.exported.type === 'Identifier' && s.exported.name === 'default'
        ) as ExportSpecifier
        if (defaultSpecifier) {
          defaultExport = node
          // 1. remove specifier
          if (node.specifiers.length > 1) {
            ctx.s.remove(
              defaultSpecifier.start! + scriptStartOffset!,
              defaultSpecifier.end! + scriptStartOffset!
            )
          } else {
            ctx.s.remove(
              node.start! + scriptStartOffset!,
              node.end! + scriptStartOffset!
            )
          }
          if (node.source) {
            // export { x as default } from './x'
            // rewrite to `import { x as __default__ } from './x'` and
            // add to top
            ctx.s.prepend(
              `import { ${defaultSpecifier.local.name} as ${normalScriptDefaultVar} } from '${node.source.value}'\n`
            )
          } else {
            // export { x as default }
            // rewrite to `const __default__ = x` and move to end
            ctx.s.appendLeft(
              scriptEndOffset!,
              `\nconst ${normalScriptDefaultVar} = ${defaultSpecifier.local.name}\n`
            )
          }
        }
        if (node.declaration) {
          walkDeclaration(
            'script',
            node.declaration,
            scriptBindings,
            vueImportAliases,
            hoistStatic
          )
        }
      } else if (
        (node.type === 'VariableDeclaration' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'ClassDeclaration' ||
          node.type === 'TSEnumDeclaration') &&
        !node.declare
      ) {
        walkDeclaration(
          'script',
          node,
          scriptBindings,
          vueImportAliases,
          hoistStatic
        )
      }
    }

    // apply reactivity transform
    // TODO remove in 3.4
    if (enableReactivityTransform && shouldTransform(script.content)) {
      const { rootRefs, importedHelpers } = transformAST(
        scriptAst,
        ctx.s,
        scriptStartOffset!
      )
      refBindings = rootRefs
      for (const h of importedHelpers) {
        ctx.helperImports.add(h)
      }
    }

    // <script> after <script setup>
    // we need to move the block up so that `const __default__` is
    // declared before being used in the actual component definition
    if (scriptStartOffset! > startOffset) {
      // if content doesn't end with newline, add one
      if (!/\n$/.test(script.content.trim())) {
        ctx.s.appendLeft(scriptEndOffset!, `\n`)
      }
      ctx.s.move(scriptStartOffset!, scriptEndOffset!, 0)
    }
  }

  // 2.2 process <script setup> body
  for (const node of scriptSetupAst.body) {
    if (node.type === 'ExpressionStatement') {
      const expr = unwrapTSNode(node.expression)
      // process `defineProps` and `defineEmit(s)` calls
      if (
        processDefineProps(ctx, expr) ||
        processDefineEmits(ctx, expr) ||
        processDefineOptions(ctx, expr) ||
        processDefineSlots(ctx, expr)
      ) {
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      } else if (processDefineExpose(ctx, expr)) {
        // defineExpose({}) -> expose({}) -> remove whole expression
        ctx.s.remove(expr.start! + startOffset, expr.end! + startOffset)
      } else {
        processDefineModel(ctx, expr)
      }

      // collect watch
      if (isCallOf(expr, m => m === vueImportAliases['watch'])) {
        const args = expr.arguments || []
        if (args[0]?.type === 'Identifier') {
          register(
            transBindings.watch,
            args[0],
            args.slice(1),
            BindingTypes.WATCH
          )
        } else if (args[0]?.type === 'ArrowFunctionExpression') {
          if (args[0].body.type === 'MemberExpression') {
            // watch(()=> a.b
            const { start, end } = args[0].body
            const id = source.slice(start! + startOffset, end! + startOffset)
            register(transBindings.watch, id, args.slice(1), BindingTypes.WATCH)
          } else if (args[0].body.type === 'Identifier') {
            // watch(()=> a,
            register(
              transBindings.watch,
              args[0].body,
              args.slice(1),
              BindingTypes.WATCH
            )
          }
        }
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      }

      if (isCallOf(expr, m => m === vueImportAliases['watchEffect'])) {
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      }

      const hooks = Object.values(LifeCircleHookMap)
      if (isCallOf(expr, m => hooks.includes(m))) {
        const { name } = expr.callee as Identifier
        const id = Object.keys(LifeCircleHookMap)[hooks.indexOf(name)]
        register(transBindings.$hooks, id, expr.arguments, BindingTypes.HOOK)
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      }
    }

    if (node.type === 'VariableDeclaration' && !node.declare) {
      const total = node.declarations.length
      let left = total
      let lastNonRemoved: number | undefined

      for (let i = 0; i < total; i++) {
        const decl = node.declarations[i]
        const init = decl.init && unwrapTSNode(decl.init)
        if (init) {
          if (processDefineOptions(ctx, init)) {
            ctx.error(
              `${DEFINE_OPTIONS}() has no returning value, it cannot be assigned.`,
              node
            )
          }

          // defineProps / defineEmits
          const isDefineProps = processDefineProps(ctx, init, decl.id)
          const isDefineEmits =
            !isDefineProps && processDefineEmits(ctx, init, decl.id)
          !isDefineEmits &&
            (processDefineSlots(ctx, init, decl.id) ||
              processDefineModel(ctx, init, decl.id))

          if (isDefineProps || isDefineEmits) {
            if (left === 1) {
              ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
            } else {
              let start = decl.start! + startOffset
              let end = decl.end! + startOffset
              if (i === total - 1) {
                // last one, locate the end of the last one that is not removed
                // if we arrive at this branch, there must have been a
                // non-removed decl before us, so lastNonRemoved is non-null.
                start = node.declarations[lastNonRemoved!].end! + startOffset
              } else {
                // not the last one, locate the start of the next
                end = node.declarations[i + 1].start! + startOffset
              }
              ctx.s.remove(start, end)
              left--
            }
          } else {
            lastNonRemoved = i
          }
        }
      }
    }

    let isAllLiteral = false
    // walk declarations to record declared bindings
    if (
      (node.type === 'VariableDeclaration' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration' ||
        node.type === 'TSEnumDeclaration') &&
      !node.declare
    ) {
      isAllLiteral = walkDeclaration(
        'scriptSetup',
        node,
        setupBindings,
        vueImportAliases,
        hoistStatic
      )
    }

    // hoist literal constants
    if (hoistStatic && isAllLiteral) {
      hoistNode(node)
    }

    // walk statements & named exports / variable declarations for top level
    // await
    if (
      (node.type === 'VariableDeclaration' && !node.declare) ||
      node.type.endsWith('Statement')
    ) {
      const scope: Statement[][] = [scriptSetupAst.body]
      // @ts-expect-error
      walk(node, {
        enter(child: Node, parent: Node | undefined) {
          if (isFunctionType(child)) {
            this.skip()
          }
          if (child.type === 'BlockStatement') {
            scope.push(child.body)
          }
          if (child.type === 'AwaitExpression') {
            hasAwait = true
            // if the await expression is an expression statement and
            // - is in the root scope
            // - or is not the first statement in a nested block scope
            // then it needs a semicolon before the generated code.
            const currentScope = scope[scope.length - 1]
            const needsSemi = currentScope.some((n, i) => {
              return (
                (scope.length === 1 || i > 0) &&
                n.type === 'ExpressionStatement' &&
                n.start === child.start
              )
            })
            processAwait(
              ctx,
              child,
              needsSemi,
              parent!.type === 'ExpressionStatement'
            )
          }
        },
        exit(node: Node) {
          if (node.type === 'BlockStatement') scope.pop()
        }
      })
    }

    if (
      (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      ctx.error(
        `<script setup> cannot contain ES module exports. ` +
          `If you are using a previous version of <script setup>, please ` +
          `consult the updated RFC at https://github.com/vuejs/rfcs/pull/227.`,
        node
      )
    }

    if (ctx.isTS) {
      // move all Type declarations to outer scope
      if (
        node.type.startsWith('TS') ||
        (node.type === 'ExportNamedDeclaration' &&
          node.exportKind === 'type') ||
        (node.type === 'VariableDeclaration' && node.declare)
      ) {
        if (node.type !== 'TSEnumDeclaration') {
          // hoistNode(node)
          ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
        } else {
          const loc = [node.start! + startOffset, node.end! + startOffset]
          let original = ctx.source.slice(loc[0], loc[1])
          original = original.replace(/enum/, 'const')
          original = original.replace('=', ':')
          original = original.replace(node.id.name, node.id.name + ' =')
          ctx.s.overwrite(loc[0], loc[1], original)
        }
      }
    }
  }

  // 2.3. transform <script setup> bindings
  for (const node of scriptSetupAst.body) {
    if (
      isCallOf(
        // @ts-expect-error
        node?.expression,
        m =>
          m === vueImportAliases['watch'] ||
          m === vueImportAliases['watchEffect'] ||
          Object.values(LifeCircleHookMap).includes(m)
      )
    ) {
      continue
    }

    if (node.type.endsWith('Statement') || node.type.endsWith('Expression')) {
      // @ts-expect-error
      walk(node, {
        enter(child: Node, parent: Node | undefined) {
          if (isMember(child)) {
            if (
              child.object.type === 'Identifier' &&
              child.object.name in transBindings
            ) {
              ctx.s.overwrite(
                child.start! + startOffset,
                child.end! + startOffset,
                'this.' + child.object.name
              )
            }
          }
          if (child.type === 'Identifier') {
            const loc = [child.start! + startOffset, child.end! + startOffset]
            if (['router', 'route', 'emit'].includes(child.name)) {
              ctx.s.overwrite(loc[0], loc[1], 'this.$' + child.name)
            }
            if (['props', '__props'].includes(child.name)) {
              ctx.s.overwrite(loc[0], loc[1], 'this')
            }
          }
        }
      })
    }
  }

  // 3 props destructure transform
  if (ctx.propsDestructureDecl) {
    transformDestructuredProps(ctx, vueImportAliases)
  }

  // 4. Apply reactivity transform
  // TODO remove in 3.4
  if (
    enableReactivityTransform &&
    // normal <script> had ref bindings that maybe used in <script setup>
    (refBindings || shouldTransform(scriptSetup.content))
  ) {
    const { rootRefs, importedHelpers } = transformAST(
      scriptSetupAst,
      ctx.s,
      startOffset,
      refBindings
    )
    refBindings = refBindings ? [...refBindings, ...rootRefs] : rootRefs
    for (const h of importedHelpers) {
      ctx.helperImports.add(h)
    }
  }

  // 5. check macro args to make sure it doesn't reference setup scope
  // variables
  checkInvalidScopeReference(ctx.propsRuntimeDecl, DEFINE_PROPS)
  checkInvalidScopeReference(ctx.propsRuntimeDefaults, DEFINE_PROPS)
  checkInvalidScopeReference(ctx.propsDestructureDecl, DEFINE_PROPS)
  checkInvalidScopeReference(ctx.emitsRuntimeDecl, DEFINE_EMITS)
  checkInvalidScopeReference(ctx.optionsRuntimeDecl, DEFINE_OPTIONS)

  // 6. remove non-script content
  if (script) {
    if (startOffset < scriptStartOffset!) {
      // <script setup> before <script>
      ctx.s.remove(0, startOffset)
      ctx.s.remove(endOffset, scriptStartOffset!)
      ctx.s.remove(scriptEndOffset!, source.length)
    } else {
      // <script> before <script setup>
      ctx.s.remove(0, scriptStartOffset!)
      ctx.s.remove(scriptEndOffset!, startOffset)
      ctx.s.remove(endOffset, source.length)
    }
  } else {
    // only <script setup>
    ctx.s.remove(0, startOffset)
    ctx.s.remove(endOffset, source.length)
  }

  // 7. analyze binding metadata
  // `defineProps` & `defineModel` also register props bindings
  if (scriptAst) {
    Object.assign(ctx.bindingMetadata, analyzeScriptBindings(scriptAst.body))
  }
  for (const [key, { isType, imported, source }] of Object.entries(
    ctx.userImports
  )) {
    if (isType) continue
    ctx.bindingMetadata[key] =
      imported === '*' ||
      (imported === 'default' && source.endsWith('.vue')) ||
      source === 'vue'
        ? BindingTypes.SETUP_CONST
        : BindingTypes.SETUP_MAYBE_REF
  }
  for (const key in scriptBindings) {
    ctx.bindingMetadata[key] = scriptBindings[key]
  }
  for (const key in setupBindings) {
    ctx.bindingMetadata[key] = setupBindings[key]
  }
  // known ref bindings
  if (refBindings) {
    for (const key of refBindings) {
      ctx.bindingMetadata[key] = BindingTypes.SETUP_REF
    }
  }

  // 8. inject `useCssVars` calls
  if (
    sfc.cssVars.length &&
    // no need to do this when targeting SSR
    !(options.inlineTemplate && options.templateOptions?.ssr)
  ) {
    // ctx.helperImports.add(CSS_VARS_HELPER)
    // ctx.helperImports.add('unref')
    // ctx.s.prependLeft(
    //   startOffset,
    //   `\n${genCssVarsCode(
    //     sfc.cssVars,
    //     ctx.bindingMetadata,
    //     scopeId,
    //     !!options.isProd
    //   )}\n`
    // )
  }

  // 9. finalize setup() argument signature
  let args = `__props`
  if (ctx.propsTypeDecl) {
    // mark as any and only cast on assignment
    // since the user defined complex types may be incompatible with the
    // inferred type from generated runtime declarations
    args += `: any`
  }
  // inject user assignment of props
  // we use a default __props so that template expressions referencing props
  // can use it directly
  // if (ctx.propsIdentifier) {
  //   ctx.s.prependLeft(
  //     startOffset,
  //     `\nconst ${ctx.propsIdentifier} = __props;\n`
  //   )
  // }
  if (ctx.propsDestructureRestId) {
    ctx.s.prependLeft(
      startOffset,
      `\nconst ${ctx.propsDestructureRestId} = ${ctx.helper(
        `createPropsRestProxy`
      )}(__props, ${JSON.stringify(
        Object.keys(ctx.propsDestructuredBindings)
      )});\n`
    )
  }
  // inject temp variables for async context preservation
  if (hasAwait) {
    const any = ctx.isTS ? `: any` : ``
    ctx.s.prependLeft(startOffset, `\nlet __temp${any}, __restore${any}\n`)
  }

  const destructureElements =
    ctx.hasDefineExposeCall || !options.inlineTemplate
      ? [`expose: __expose`]
      : []
  if (ctx.emitIdentifier) {
    destructureElements.push(
      ctx.emitIdentifier === `emit` ? `emit` : `emit: ${ctx.emitIdentifier}`
    )
  }
  if (destructureElements.length) {
    args += `, { ${destructureElements.join(', ')} }`
  }

  // 10. generate return statement

  // 11. finalize default export
  const genDefaultAs = options.genDefaultAs
    ? `const ${options.genDefaultAs} =`
    : `export default`

  let runtimeOptions = ``
  if (!ctx.hasDefaultExportName && filename && filename !== DEFAULT_FILENAME) {
    const match = filename.match(/([^/\\]+)\.\w+$/)
    if (match) {
      runtimeOptions += `\n  __name: '${match[1]}',`
    }
  }
  if (hasInlinedSsrRenderFn) {
    runtimeOptions += `\n  __ssrInlineRender: true,`
  }

  const propsDecl = genRuntimeProps(ctx)
  if (propsDecl) runtimeOptions += `\n  props: ${propsDecl},`

  const code = transformBindings(transBindings)
  if (code) runtimeOptions += `\n  ${code},`

  // const emitsDecl = genRuntimeEmits(ctx)
  // if (emitsDecl) runtimeOptions += `\n  emits: ${emitsDecl},`

  let definedOptions = ''
  if (ctx.optionsRuntimeDecl) {
    definedOptions = scriptSetup.content
      .slice(ctx.optionsRuntimeDecl.start!, ctx.optionsRuntimeDecl.end!)
      .trim()
  }

  // <script setup> components are closed by default. If the user did not
  // explicitly call `defineExpose`, call expose() with no args.
  // ctx.hasDefineExposeCall || options.inlineTemplate ? `` : `  __expose();\n`

  // wrap setup code with function.
  if (ctx.isTS) {
    // for TS, make sure the exported type is still valid type with
    // correct props information
    // we have to use object spread for types to be merged properly
    // user's TS setting should compile it down to proper targets
    // export default defineComponent({ ...__default__, ... })
    const def =
      (defaultExport ? `\n  ...${normalScriptDefaultVar},` : ``) +
      (definedOptions ? `\n  ...${definedOptions},` : '')
    ctx.s.prependLeft(
      startOffset,
      `\n${genDefaultAs} {${def}${runtimeOptions}\n  ${
        hasAwait ? `async ` : ``
      }created() {\n`
    )
    ctx.s.appendRight(endOffset, `}}`)
  } else {
    if (defaultExport || definedOptions) {
      // without TS, can't rely on rest spread, so we use Object.assign
      // export default Object.assign(__default__, { ... })
      ctx.s.prependLeft(
        startOffset,
        `\n${genDefaultAs} Object.assign(${
          defaultExport ? `${normalScriptDefaultVar}, ` : ''
        }${definedOptions ? `${definedOptions}, ` : ''}{${runtimeOptions}\n  ` +
          `${hasAwait ? `async ` : ``}created() {\n`
      )
      ctx.s.appendRight(endOffset, `})`)
    } else {
      ctx.s.prependLeft(
        startOffset,
        `\n${genDefaultAs} {${runtimeOptions}\n  ` +
          `${hasAwait ? `async ` : ``}created() {\n`
      )
      ctx.s.appendRight(endOffset, `}}`)
    }
  }

  // 12. finalize Vue helper imports

  ctx.s.trim()

  return {
    ...scriptSetup,
    bindings: ctx.bindingMetadata as any,
    transBindings,
    imports: ctx.userImports,
    content: ctx.s.toString(),
    map:
      options.sourceMap !== false
        ? (ctx.s.generateMap({
            source: filename,
            hires: true,
            includeContent: true
          }) as unknown as RawSourceMap)
        : undefined,
    scriptAst: scriptAst?.body,
    scriptSetupAst: scriptSetupAst?.body,
    deps: ctx.deps ? [...ctx.deps] : undefined
  }
}

function registerBinding(
  bindings: Record<string, BindingTypes>,
  node: Identifier,
  type: BindingTypes
) {
  bindings[node.name] = type
}

function walkObjectPattern(
  node: ObjectPattern,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isDefineCall = false
) {
  for (const p of node.properties) {
    if (p.type === 'ObjectProperty') {
      if (p.key.type === 'Identifier' && p.key === p.value) {
        // shorthand: const { x } = ...
        const type = isDefineCall
          ? BindingTypes.SETUP_CONST
          : isConst
          ? BindingTypes.SETUP_MAYBE_REF
          : BindingTypes.SETUP_LET
        registerBinding(bindings, p.key, type)
      } else {
        walkPattern(p.value, bindings, isConst, isDefineCall)
      }
    } else {
      // ...rest
      // argument can only be identifier when destructuring
      const type = isConst ? BindingTypes.SETUP_CONST : BindingTypes.SETUP_LET
      registerBinding(bindings, p.argument as Identifier, type)
    }
  }
}

function walkArrayPattern(
  node: ArrayPattern,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isDefineCall = false
) {
  for (const e of node.elements) {
    e && walkPattern(e, bindings, isConst, isDefineCall)
  }
}

function walkPattern(
  node: Node,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isDefineCall = false
) {
  if (node.type === 'Identifier') {
    const type = isDefineCall
      ? BindingTypes.SETUP_CONST
      : isConst
      ? BindingTypes.SETUP_MAYBE_REF
      : BindingTypes.SETUP_LET
    registerBinding(bindings, node, type)
  } else if (node.type === 'RestElement') {
    // argument can only be identifier when destructuring
    const type = isConst ? BindingTypes.SETUP_CONST : BindingTypes.SETUP_LET
    registerBinding(bindings, node.argument as Identifier, type)
  } else if (node.type === 'ObjectPattern') {
    walkObjectPattern(node, bindings, isConst)
  } else if (node.type === 'ArrayPattern') {
    walkArrayPattern(node, bindings, isConst)
  } else if (node.type === 'AssignmentPattern') {
    if (node.left.type === 'Identifier') {
      const type = isDefineCall
        ? BindingTypes.SETUP_CONST
        : isConst
        ? BindingTypes.SETUP_MAYBE_REF
        : BindingTypes.SETUP_LET
      registerBinding(bindings, node.left, type)
    } else {
      walkPattern(node.left, bindings, isConst)
    }
  }
}

function canNeverBeRef(node: Node, userReactiveImport?: string): boolean {
  if (isCallOf(node, userReactiveImport)) {
    return true
  }
  switch (node.type) {
    case 'UnaryExpression':
    case 'BinaryExpression':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'UpdateExpression':
    case 'ClassExpression':
    case 'TaggedTemplateExpression':
      return true
    case 'SequenceExpression':
      return canNeverBeRef(
        node.expressions[node.expressions.length - 1],
        userReactiveImport
      )
    default:
      if (isLiteralNode(node)) {
        return true
      }
      return false
  }
}

function isStaticNode(node: Node): boolean {
  node = unwrapTSNode(node)

  switch (node.type) {
    case 'UnaryExpression': // void 0, !true
      return isStaticNode(node.argument)

    case 'LogicalExpression': // 1 > 2
    case 'BinaryExpression': // 1 + 2
      return isStaticNode(node.left) && isStaticNode(node.right)

    case 'ConditionalExpression': {
      // 1 ? 2 : 3
      return (
        isStaticNode(node.test) &&
        isStaticNode(node.consequent) &&
        isStaticNode(node.alternate)
      )
    }

    case 'SequenceExpression': // (1, 2)
    case 'TemplateLiteral': // `foo${1}`
      return node.expressions.every(expr => isStaticNode(expr))

    case 'ParenthesizedExpression': // (1)
      return isStaticNode(node.expression)

    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'BigIntLiteral':
      return true
  }
  return false
}

function walkTemplate(
  node: ElementNode | TemplateChildNode,
  bindings: TransformBindingsMap
) {
  if ('children' in node) {
    for (const child of node.children) {
      if (typeof child === 'string' || typeof child === 'symbol') continue
      // console.log(child)
      if ('type' in child && child.type === 1) {
        child?.props?.find((prop: any) => {
          if (prop?.name === 'ref') {
            register(bindings.$refs, prop?.value?.content, null, BindingTypes.$)
          }
        })
        walkTemplate(child, bindings)
      }
    }
  }
}
