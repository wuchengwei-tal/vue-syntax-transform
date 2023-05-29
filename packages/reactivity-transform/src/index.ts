export * from './data'

export { compileScript } from './compileScript'

import { compileScript } from './compileScript'

export { SFCScriptCompileOptions } from './compileScript'

import { parse } from '@vue/compiler-sfc'
export function reactivityTransform(src: string, id = 'xxxxxx') {
  if (!/\.vue|\.ts|\.js$/.test(id) || !src) return { content: '' }
  let prefix = ''
  let suffix = ''

  if (!/\.vue/.test(id)) {
    prefix = '<script setup'
    suffix = '</script>'
    if (/\.ts/.test(id)) prefix += ' lang="ts"'
    prefix += '>'

    src = prefix + src + suffix
  }

  const { descriptor } = parse(src)
  const result = compileScript(descriptor, {
    id,
    reactivityTransform: true
  })

  prefix && (result.content = result.content.replace(prefix, ''))
  suffix && (result.content = result.content.replace(suffix, ''))
  return result
}
