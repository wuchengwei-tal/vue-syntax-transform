import type { ClassSelector, CssNode, Dimension, Raw, Selector } from 'css-tree'
import MagicString from 'magic-string'

import { workspace } from 'vscode'
import { computed, reactive, ref } from '@vue/reactivity'

const csstree = require('css-tree')

const _configState = ref(0)
function getConfig<T = any>(key: string): T | undefined {
  return workspace.getConfiguration().get<T>(key)
}

async function setConfig(key: string, value: any, isGlobal = true) {
  // update value
  return await workspace.getConfiguration().update(key, value, isGlobal)
}

function createConfigRef<T>(key: string, defaultValue: T, isGlobal = true) {
  return computed({
    get: () => {
      // to force computed update
      // eslint-disable-next-line no-unused-expressions
      _configState.value
      return getConfig<T>(key) ?? defaultValue
    },
    set: (v: T) => {
      setConfig(key, v, isGlobal)
    }
  })
}

export const config = reactive({
  ratio: createConfigRef(`${'vue-transform'}.css-ratio`, true)
})

export function cssTransform(css: string) {
  return _cssTransform(transComment(css))
}

function _cssTransform(css: string, raw = '') {
  const s = new MagicString(css)
  const ast = csstree.parse(css, { positions: true })

  function transDimension(node: Dimension) {
    if (node.unit === 'rem') {
      let { start, end } = node.loc!
      let val: string | number = parseFloat(node.value) * (config.ratio || 100)
      val = Number.isInteger(val) ? val : val.toFixed(2)
      val = val + 'px'
      s.overwrite(start.offset, end.offset, val)
    }
  }

  function transSelector(node: Selector) {
    const head = node.children.first
    if (head?.type === 'Combinator' && /\/\s*deep\s*\//.test(head?.name)) {
      const { start, end } = head.loc!
      s.overwrite(start.offset, end.offset, ':deep(')
      s.appendRight(node.loc!.end.offset, ')')
    }
  }

  function transRaw(node: Raw) {
    if (node.value !== raw) {
      const { start, end } = node.loc!
      const css = _cssTransform(node.value, node.value)
      s.overwrite(start.offset, end.offset, css)
    }
  }

  function transClassSelector(node: ClassSelector) {
    const { start, end } = node.loc!
    if (node.name === 'v-enter') {
      s.overwrite(start.offset, end.offset, 'v-enter-from')
    }
    if (node.name === 'v-leave') {
      s.overwrite(start.offset, end.offset, 'v-leave-from')
    }
  }

  csstree.walk(ast, {
    leave(node: CssNode) {
      if (node.type === 'Dimension') transDimension(node)

      if (node.type === 'Selector') transSelector(node)

      if (node.type === 'ClassSelector') transClassSelector(node)

      if (node.type === 'Raw') transRaw(node)
    }
  })

  return s.toString()
}

export function transComment(css: string) {
  let code = ''
  for (let line of css.split('\n')) {
    if (/\s*\/\/.*/.test(line)) {
      line = line.replace('//', '/*')
      line += ' */'
    }

    code += line + '\n'
  }
  return code
}
