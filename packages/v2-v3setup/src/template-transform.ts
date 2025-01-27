import MagicString from 'magic-string'
import type { ASTElement, SFCBlock, ASTNode } from 'vue-template-compiler'
import { Comment } from './data'

type Template = { ast?: ASTElement; inheritAttrs: boolean } & SFCBlock

export function templateTransform(template: Template): { content: string } {
  if (!template || !template.ast) return { content: '' }
  const { ast, content, inheritAttrs } = template
  const s = new MagicString(content)

  const offset = 1
  // console.log(ast)

  function walk(ast: ASTElement) {
    transNode(ast)
    ast.children.forEach(node => {
      if (node.type === ELEMENT) {
        walk(node)
      } else if (node.type === TEXT) {
      } else if (node.type === Expression) {
      }
    })
  }

  function transNode(node: ASTElement) {
    node.attrs?.forEach((attr, i) => {
      // .sync -> v-model
      if (node.attrsList[i]?.name === `:${attr.name}.sync`) {
        const vModel = ` v-model:${attr.name}="${attr.value}" `
        // @ts-ignore
        s.overwrite(attr.start + offset, attr.end + offset + 1, vModel)
      }
    })

    const vBind = node.attrsList.find(attr => attr.name === 'v-bind')
    if (vBind || node.nativeEvents) {
      const events = Object.keys(node?.nativeEvents || {})

      node.attrsList.forEach(attr => {
        // @ts-ignore
        const { start, end, name } = attr

        // console.log(node)
        // rm v-on.native
        events.forEach(event => {
          if (name.includes(`v-on:${event}`) || name.includes(`@${event}`)) {
            let value = s.original.slice(start + offset, end + offset)
            value = value.replace(`.native`, '')
            // console.log(value, start, end)
            s.overwrite(start + offset, end + offset, value)
          }
        })

        // v-bind order
        // @ts-ignore
        if (start < vBind?.start) {
          const value = s.toString().slice(start + offset, end + offset)
          s.remove(start + offset, end + offset)
          // @ts-ignore
          s.appendRight(vBind.end + offset, ' ' + value)
        }
      })
    }

    transDirective(node)

    transIsAttr(node)

    removeKeyAttr(node)

    transFilter(node)
  }

  function removeKeyAttr(node: ASTElement) {
    const { ifConditions } = node

    const getKey = (n: ASTNode) =>
      // @ts-ignore
      n.rawAttrsMap?.['key'] || n.rawAttrsMap?.[':key']

    if (node['for']) {
      // console.log(node.children, node.alias)
      // rm v-for children's key
      node.children.forEach(child => {
        if (child.type !== ELEMENT || !child.key) return
        const key = getKey(child)
        if (key) {
          const { start, end } = key
          s.remove(start + offset, end + offset)
          delete child?.key
        }
      })

      // @ts-ignore
      const vFor = node?.rawAttrsMap?.['v-for']
      if (vFor && !node.key) {
        const { start, end } = vFor
        let { alias, iterator1 } = node
        if (!iterator1) iterator1 = 'i_' + alias

        const value = `v-for="(${alias}, ${iterator1}) in ${node['for']}"`
        s.overwrite(start + offset, end + offset, value)
        s.appendRight(end + offset, ` :key="${iterator1}"`)
      }

      // add Migration Strategy comment for v-if and v-for
      if (ifConditions?.length) {
        // @ts-ignore
        s.appendLeft(node.start, Comment.vForAndVIf)
      }
    }

    // rm v-if's key
    if (ifConditions?.length) {
      ifConditions.forEach(condition => {
        if (condition?.block?.key) {
          // console.log(condition)
          const { block } = condition

          const key = getKey(block)
          if (key) {
            const { start, end } = key
            s.remove(start + offset, end + offset)
          }
        }
      })
    }
  }

  function transDirective(node: ASTElement) {
    const { directives, attrsList } = node
    if (!directives) return

    directives.forEach(directive => {
      // @ts-ignore
      const { name, value, start, end } = directive
      if (name === 'on') {
        if (value === '$listeners') {
          s.remove(start + offset, end + offset)
        }
      }

      if (name === 'bind' && value === '$attrs' && !inheritAttrs) {
        // @ts-ignore
        s.appendLeft(node.start + offset, Comment.inheritAttrsFalse)
      }
    })
  }

  function transIsAttr(node: ASTElement) {
    if (node.attrsMap['is']) {
      // @ts-ignore
      const { tag, start, end } = node
      if (tag !== 'component') {
        let value = s.original.slice(start + offset, end + offset)
        value = value.replace(`<${tag}`, '<component')
        value = value.replace(`</${tag}>`, '</component>')
        s.overwrite(start + offset, end + offset, value)
      }
    }
  }

  function transFilter(node: ASTElement) {
    const isFilter = (exp: string) => /_f\(.+\)\(.+\)/.test(exp)

    const trans = (v: string) => {
      const matched = v.match(/_f\((.+)\)\((.+)\)/)
      if (!matched) return ''
      let [_, filter, arg] = matched
      filter = filter.replace(/"/g, '')
      arg = arg.replace(/\)/g, '')
      return `${filter}(${arg})`
    }

    node?.children?.forEach(child => {
      // @ts-ignore
      const { type, start, end } = child
      if (type === Expression && isFilter(child.expression)) {
        let val = trans(child.expression)
        if (/\{\{.*\}\}/.test(child.text)) val = `{{ ${val} }}`
        if (val) s.overwrite(start + offset, end + offset, val)
      }

      // regexp to replace _f("currencyUSD")(accountBalance) to currencyUSD(accountBalance)
    })

    node.attrs?.forEach(attr => {
      // @ts-ignore
      const { name, value, start, end } = attr
      if (isFilter(value)) {
        const val = trans(value)
        const original = s.original.slice(start + offset, end + offset)
        const newValue = original.replace(node.attrsMap[':' + name], val)
        if (val) s.overwrite(start + offset, end + offset, newValue)
      }
    })
  }

  walk(ast)
  // console.log(s.toString())
  return { content: s.toString() }
}

const ELEMENT = 1
const Expression = 2
const TEXT = 3
