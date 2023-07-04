export { compileScript } from './compileScript'

import { compileScript } from './compileScript'

export { SFCScriptCompileOptions } from './compileScript'

import { parse } from '@vue/compiler-sfc'

export function reactivityTransform(src: string, id = 'xxxxxx') {
  const { descriptor } = parse(src)
  return compileScript(descriptor, {
    id,
    reactivityTransform: true
  })
}
