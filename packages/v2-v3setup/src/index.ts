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

function transformActions(code: string) {
  const fnRe = /(export )?const \w+ = (async )?\(.*[\)|\n]/g

  let match
  let last = 0
  let output = ''
  while ((match = fnRe.exec(code))) {
    const pre = code.slice(last, match.index)

    let [line, _, __] = match

    last = match.index + line.length

    let flag = line[line.length - 2]
    // console.log(line);
    if (line) {
      // oneline params
      if (flag === '{') {
        const match = /\(((\{.*\})|(\w+)),? ?(.*)?\)/.exec(line)
        if (match) {
          let [arg1, _, __, ___, arg2e] = match
          line = line.replace(arg1.slice(1, -1), arg2e || '')
        }
      }
      output += pre + line
      // multi line params
      if (flag === '(') {
        const params = parseInside(code, last, '(')
        let i = 0
        while (params[i++] !== '}');
        if (params[i] === ',') i++
        output += params.slice(i)

        last += params.length
        while (code[last++] !== '{') output += code[last]
        flag = '{'
      }
    }

    if (flag === '{') {
      let body = parseInside(code, last, '{')
      last += body.length
      body = replaceActionBody(body)
      body = replaceState(body)
      output += body
    }
  }
  output += code.slice(last)

  // console.log(output);
  return output
}

const Pair = { '{': '}', '(': ')', '[': ']' }
function parseInside(code: string, s: number, p: keyof typeof Pair) {
  let e = s
  let cnt = 0
  while (e < code.length - 1) {
    const ch = code[e++]
    if (ch === p) cnt++
    if (ch === Pair[p]) {
      if (cnt) cnt--
      else break
    }
  }
  const body = code.slice(s, e)
  return body
}

function replaceActionBody(code: string) {
  const dispatchRe = /(((store\.)?dispatch)|(commit))\('?((\w+\.?\w+))'?,? ?/g

  let match
  let last = 0
  let output = ''
  while ((match = dispatchRe.exec(code))) {
    const pre = code.slice(last, match.index)

    let [line, _, store, dispatch, commit, fn] = match

    last = match.index + line.length

    if (line && fn) {
      if (fn.includes('.')) fn = fn.split('.')[1]
      line = fn + '('
      // console.log(line)
    }

    output += pre + line
  }
  output += code.slice(last)
  // console.log(output);
  return output
}

function transformMutations(code: string) {
  const { body, index } = getExportDefault(code)
  if (!body) return code

  let last = index
  let output = code.slice(0, index)

  let match
  const mutationRe = /((\w+)|\[types.(\w+)\])(\(state,?.*\)) {/g
  while ((match = mutationRe.exec(body))) {
    let pre = ''
    if (last !== index) pre = body.slice(last, match.index)

    let [line, _, name, type, params] = match

    last = match.index + line.length
    params = params.replace(/state,? ?/, '')
    line = 'export function ' + (name || type) + params + '{'

    let mutationBody = parseInside(body, last, '{')
    last += mutationBody.length + 1 // del comma

    mutationBody = replaceState(mutationBody)

    output += pre + line + mutationBody
  }

  return output
}

function getExportDefault(code: string) {
  const defaultRe = /export default {/
  const match = defaultRe.exec(code)
  if (match) {
    return {
      body: parseInside(code, match.index, '{'),
      index: match.index
    }
  }
  return {}
}

function replaceState(code: string) {
  const stateRe = /(state\.\w+)( |\(|\.|\[|,)/g
  let last = 0
  let output = ''
  let match
  while ((match = stateRe.exec(code))) {
    const pre = code.slice(last, match.index)

    let [res, state] = match
    last = match.index + res.length

    if (res.endsWith('.')) res = res.replace(res, `${res}value.`)
    else res = res.replace(state, `${state}.value`)
    res = res.replace('state.', '')

    output += pre + res
  }
  output += code.slice(last)

  output = output.replace(/rootState\??\.\w+\??\./g, '')

  return output
}
