import type { CssNode, Dimension, Raw, Selector } from 'css-tree'
import MagicString from 'magic-string'
const csstree = require('css-tree')

const Ratio = 100

export function cssTransform(css: string) {
  return _cssTransform(transComment(css))
}

export function _cssTransform(css: string, raw = '') {
  const s = new MagicString(css)
  const ast = csstree.parse(css, { positions: true })

  function transDimension(node: Dimension) {
    if (node.unit === 'rem') {
      let { start, end } = node.loc!
      const val = parseFloat(node.value) * Ratio + 'px'
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

  csstree.walk(ast, {
    leave(node: CssNode) {
      if (node.type === 'Dimension') transDimension(node)

      if (node.type === 'Selector') transSelector(node)

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
