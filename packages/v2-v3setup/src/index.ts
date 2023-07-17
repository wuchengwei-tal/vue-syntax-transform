import {
  type SFCDescriptor,
  parseComponent,
  compile
} from 'vue-template-compiler'

import { compileScript } from './compileScript'

import { templateTransform } from './template-transform'
import { cssTransform } from './css-transform'
import MagicString from 'magic-string'

export * from './data'

type TransformedSFC = {
  template?: ReturnType<typeof templateTransform>
  script?: ReturnType<typeof compileScript>
  styles?: ReturnType<typeof cssTransform>[]
  content: string
}

export function sfcTransform(sfc: string, id = '') {
  const descriptor = parseComponent(sfc) as SFCDescriptor & {
    source: string
    cssVars: string[]
    errors: any[]
  }

  const { script, template, styles, source } = descriptor

  const s = new MagicString(source)

  const ret: TransformedSFC = { content: '', styles: [] }

  let inheritAttrs = true
  if (script) {
    // console.log(descriptor)
    const match = script.content.match(/inheritAttrs\s*:\s*(true|false)/)
    if (match) inheritAttrs = match[1] === 'true'
  }

  if (template) {
    const { content, start, end } = template

    const { ast } = compile(content, {
      outputSourceRange: true,
      whitespace: 'preserve'
    })
    ret.template = templateTransform({ ast, ...template, inheritAttrs })
    s.overwrite(start!, end!, ret.template.content)
  }

  if (script) {
    const { start, end, content } = script
    if (content) {
      ret.script = compileScript(content, { id })
      s.overwrite(start!, end!, '\n' + ret.script.content + '\n')
      let i = start!
      while (source[i--] === '>');
      while (source[--i] !== '<');
      if (source.slice(i, i + 7) === '<script') {
        s.prependRight(i + 7, ' setup')
      }
    }
  }

  if (styles.length) {
    styles.forEach(style => {
      const { start, end, content } = style
      if (content) {
        const res = cssTransform(content)
        ret.styles?.push(res)
        s.overwrite(start!, end!, res)
      }
    })
  }

  return { ...ret, content: s.toString() }
}
