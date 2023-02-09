export * from './data'
export { compileTemplate } from './compileTemplate'
export { compileScript } from './compileScript'
export { rewriteDefault } from './rewriteDefault'
export {
  shouldTransform as shouldTransformRef,
  transform as transformRef,
  transformAST as transformRefAST
} from '@vue/reactivity-transform'

// Utilities
export { parse as babelParse } from '@babel/parser'
import MagicString from 'magic-string'
export { MagicString }
// technically internal but we want it in @vue/repl, cast it as any to avoid
// relying on estree types
import { walk as _walk } from 'estree-walker'
import { compileScript } from './compileScript'
export const walk = _walk as any

export {
  TemplateCompiler,
  SFCTemplateCompileOptions,
  SFCTemplateCompileResults
} from './compileTemplate'

export { SFCScriptCompileOptions } from './compileScript'
export { AssetURLOptions, AssetURLTagConfig } from './templateTransformAssetUrl'

import { parse } from '@vue/compiler-sfc'
export function reactivityTransform(src: string, id = 'xxxxxx') {
  const { descriptor } = parse(src)
  const { content } = compileScript(descriptor, {
    id,
    reactivityTransform: true
  })

  return content
}
