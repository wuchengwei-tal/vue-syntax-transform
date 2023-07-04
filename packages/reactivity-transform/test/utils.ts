import { SFCScriptCompileOptions, compileScript } from '../src'
import { parse, SFCParseOptions } from '@vue/compiler-sfc'

export const mockId = 'xxxxxxxx'

export function compileSFCScript(
  src: string,
  options?: Partial<SFCScriptCompileOptions>,
  parseOptions?: SFCParseOptions
) {
  const { descriptor } = parse(src, parseOptions)
  return compileScript(descriptor, {
    ...options,
    id: mockId
  })
}
