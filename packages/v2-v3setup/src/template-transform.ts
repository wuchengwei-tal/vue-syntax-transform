import MagicString from 'magic-string'
import { ASTElement, ASTNode, SFCBlock } from 'vue-template-compiler'

export function templateTransform(template: { ast?: ASTElement } & SFCBlock) {
  if (!template || !template.ast) return ''
  const { ast, content } = template
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
      if (node.attrsList[i].name === `:${attr.name}.sync`) {
        const vModel = `v-model:${attr.name}="${attr.value}"`
        // @ts-ignore
        s.overwrite(attr.start + offset, attr.end + offset, vModel)
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
            console.log(value, start, end)
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

    const { ifConditions } = node

    if (node['for']) {
      // console.log(node.children, node.alias)
      // rm v-for children's key
      node.children.forEach(child => {
        if (child.type !== ELEMENT || !child.key) return
        // @ts-ignore
        const key = child?.rawAttrsMap?.['key'] || child?.rawAttrsMap?.[':key']
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
        const comment = `
        <!-- 
        It is recommended to avoid using both on the same element due to the syntax ambiguity. 
        Rather than managing this at the template level, one method for accomplishing this is to create a computed property that filters out a list for the visible elements.
        -->\n`
        // @ts-ignore
        s.appendLeft(node.start, comment)
      }
    }

    // rm v-if's key
    if (ifConditions?.length) {
      ifConditions.forEach(condition => {
        if (condition?.block?.key) {
          // console.log(condition)
          const { block } = condition

          const key =
            // @ts-ignore
            block?.rawAttrsMap?.['key'] || block?.rawAttrsMap?.[':key']
          if (key) {
            const { start, end } = key
            s.remove(start + offset, end + offset)
          }
        }
      })
    }
  }

  walk(ast)
  console.log(s.toString())
  return s.toString()
}

const ELEMENT = 1
const Expression = 2
const TEXT = 3
