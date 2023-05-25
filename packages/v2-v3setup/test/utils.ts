import { expect } from 'vitest'

import { compileScript } from '../src/compileScript'
import { templateTransform } from '../src/template-transform'
import {
  parse,
  SFCParseOptions,
  SFCScriptCompileOptions
} from '@vue/compiler-sfc'
import { parseComponent, compile } from 'vue-template-compiler'
import { parse as babelParse } from '@babel/parser'

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

export function transTemplate(source: string) {
  const descriptor = parseComponent(source)
  const { template } = descriptor
  if (!template) return ''

  const { ast } = compile(template.content.trim(), { outputSourceRange: true })
  return templateTransform({ ast, ...template })
}

export function assertCode(code: string) {
  // parse the generated code to make sure it is valid
  try {
    babelParse(code, {
      sourceType: 'module',
      plugins: ['typescript']
    })
  } catch (e: any) {
    console.log(code)
    throw e
  }
  expect(code).toMatchSnapshot()
}
