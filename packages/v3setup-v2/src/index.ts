import { parse } from '@vue/compiler-sfc'

import { compileScript } from './compileScript'
import MagicString from 'magic-string'

type TransformedSFC = {
  // template?: ReturnType<typeof templateTransform>
  script?: ReturnType<typeof compileScript>
  styles?: ReturnType<any>[]
  content: string
}

export function v3SetupToV2(sfc: string, id = '') {
  const { descriptor } = parse(sfc)
  const { script, scriptSetup, template, styles, source } = descriptor

  const s = new MagicString(source)

  const ret: TransformedSFC = { content: '', styles: [] }

  if (script || scriptSetup) {
    ret.script = compileScript(descriptor, { id: '', hoistStatic: true })

    let start = -1
    let end = -1
    if (scriptSetup) {
      start = scriptSetup.loc.start.offset
      end = scriptSetup.loc.end.offset
    }
    if (script) {
      start = start!
        ? Math.min(start, script.loc.start.offset)
        : script.loc.start.offset
      end = end! ? Math.max(end, script.loc.end.offset) : script.loc.end.offset
    }
    if (start !== -1) {
      s.overwrite(start, end, '\n' + ret.script.content + '\n')

      let i = start!
      let len = 0
      while (source[i--] === '>');
      while (source[--i] !== '<') len++
      s.overwrite(i, i + len + 1, '<script')
    }
  }

  return { ...ret, content: s.toString() }
}

export function transform(code: string) {
  const { descriptor } = parse(code)
  return compileScript(descriptor, {
    id: '',
    hoistStatic: true,
    reactivityTransform: true
  })
}
