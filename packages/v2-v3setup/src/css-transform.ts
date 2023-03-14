import type { CssNode, Dimension, ListItem } from 'css-tree'
import { parse, walk, generate, List } from 'css-tree'
import { MagicString } from ''

export function cssTransform(css: string) {
  return generate(_cssTransform(css))
}

export function _cssTransform(css: string) {
  const ast = parse(css)

  let inBlock = false
  walk(ast, {
    enter(node: CssNode) {
      if (node.type === 'Dimension') transDimension(node)

      if (node.type === 'Selector') {
        const psudo = transDeep(node.children)
        if (psudo) node.children = psudo
      }

      if (node.type === 'Block') {
        inBlock = true
        const { children } = node

        children.forEach((data, o) => {
          if (data.type === 'Raw') {
            const css = data.value.replace(/\/\/.*\n/, '')
            const n = children.createItem(_cssTransform(css))
            children.replace(o, n)
          }
        })
      }
    },
    leave(node: CssNode) {
      if (node.type === 'Block') {
        inBlock = false
      }
    }
  })

  return ast
}

const Ratio = 100
function transDimension(node: Dimension) {
  if (node.unit === 'rem') {
    node.value = String(parseFloat(node.value) * Ratio)
    node.unit = 'px'
  }
}

function transDeep(ctx: List<CssNode>) {
  const data = ctx.first
  if (!data) return
  if (data.type === 'Combinator' && /\/\s*deep\s*\//.test(data.name)) {
    const value = ctx.reduce<string>((v, d) => {
      if ('name' in d && d.name !== data.name) {
        return v + d!.name
      } else return ''
    }, '')
    const children = new List<CssNode>().fromArray([{ type: 'Raw', value }])
    const node: CssNode = {
      type: 'PseudoClassSelector',
      name: 'deep',
      children
    }

    return new List<CssNode>().fromArray([node])
  }
}
