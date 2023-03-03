import { parse } from '@vue/compiler-sfc'
import { compileScript } from './src/compileScript'

export * from './src/data'

export function v2ToV3Setup(src: string, id: string) {
  if (!/\.vue|\.js$/.test(id) || !src) return { content: '' }

  let prefix = ''
  let suffix = ''

  if (!/\.vue/.test(id)) {
    prefix = '<script>'
    suffix = '</script>'
    src = prefix + src + suffix
  }
  const { descriptor } = parse(src)

  const result = compileScript(descriptor, { id })
  prefix && (result.content = result.content.replace(prefix, ''))
  suffix && (result.content = result.content.replace(suffix, ''))
  return result
}

function transformSript(script: string) {
  const output = {} as any
  const { props } = output
  //   type Prop =
  output.props = ''
  for (const prop of props) {
    output.props += `${prop[0]}: ${prop[1] !== 'array' ? prop[1] : 'any[]'}; `
  }
  output.props = `{${output.props}}`
  const inline = props.length < 3
  let propCode = `defineProps<${inline ? output.props : 'Props'}>()`
  const defaultValue = props.reduce(
    (obj: any, prop: string) =>
      prop[2] && Object.assign(obj, { [prop[0]]: prop[2] }),
    {}
  )
  const defaults = inline && Object.keys(defaultValue || {})?.length
  defaults && (propCode = `withDefaults(${propCode}, ${defaultValue})`)
  const code = `<script lang='ts' setup>
  ${output.imports || ''}
  ${inline ? '' : 'type Props = ' + output.props}
  const props = ${propCode};\n
  ${output.states || ''}\n
  ${output.getters || ''}\n
  ${output.methods || ''}\n
  ${output.watchers || ''}\n
  ${output.hooks}\n
  </script>\n
    `

  //   return "";
  return replaceActionBody(code)
}

function transformStyle(style: string) {
  let code = ''
  for (let line of style.split('\n')) {
    // 1.23rem to 123px
    const matches = Array.from(line.matchAll(/(-?\d+\.?\d+)rem/g))
    let newLine = ''
    let i = 0
    for (const match of matches) {
      const len = match[0].length
      const val = Math.round(+match[1] * 100).toFixed(0)
      const { index } = match
      newLine += line.slice(i, index) + val + 'px'
      i = index! + len
    }
    newLine += line.slice(i, line.length)
    // if (matches.length) console.log(newLine);
    code += newLine + '\n'
  }

  return code
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
    if (ch == Pair[p]) {
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
