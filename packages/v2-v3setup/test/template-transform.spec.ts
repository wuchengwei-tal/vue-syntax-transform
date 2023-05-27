import { expect } from 'vitest'
import { sfcTransform } from '../src'
import { Comment } from '../src/data'

describe('Template Directives', () => {
  test('v-model usage on components has been reworked, replacing v-bind.sync', () => {
    const { template } = sfcTransform(`
    <template>
        <ChildComponent :title.sync="pageTitle" :[x]="" >
          <GrandChildComponent :title.sync="pageTitle" />
        </ChildComponent>
    </template>
    `)

    const { content } = template!

    expect(content).not.toMatch('.sync')
    expect(content).toMatch('ChildComponent  v-model:title="pageTitle" ')
    expect(content).toMatch('GrandChildComponent  v-model:title="pageTitle" ')
  })

  test('key usage on <template v-for> and non-v-for nodes has changed', () => {
    var { template } = sfcTransform(`
    <template>
      <div>
        <div v-if="condition" key="yes">Yes</div>
        <div v-else key="no">No</div>
      </div>
    </template>
    `)
    var { content } = template!
    expect(content).not.toMatch('key=')

    var { template } = sfcTransform(`
    <template>
      <div>
        <template v-for="item in list">
          <div :key="'heading-' + item.id">...</div>
          <span :key="'template-' + item.id">...</span>
        </template>

        <template v-for="item1 in list1">
          <div v-if="item.isVisible" :key="item.id">...</div>
          <span v-else :key="item.id">...</span>
        </template>  
         
        <template v-for="(item2,i,j) in list2">
          <div v-if="item.isVisible" :key="item.id">...</div>
          <span v-else :key="item.id">...</span>
        </template> 
          
        <template v-for="(item2,i,j) in list2" :key="i">
          <div v-if="item.isVisible" :key="item.id">...</div>
          <span v-else :key="item.id">...</span>
        </template>   
      </div>
    </template>
    `)
    var { content } = template!
    expect(content).toMatch(
      '<template v-for="(item, i_item) in list" :key="i_item"'
    )
    expect(content).toMatch(
      '<template v-for="(item1, i_item1) in list1" :key="i_item1"'
    )
    content = content?.replace(/\<template .*\>/gm, '')
    expect(content).not.toMatch('key=')
  })

  test('v-if and v-for precedence when used on the same element has changed ', () => {
    const { template } = sfcTransform(`
    <template>
      <div>
        <div v-for="item in list" v-if="bool">
          <div v-if="item.isVisible" :key="item.id">...</div>
          <span v-else :key="item.id">...</span>
        </div>
      </div>
    </template>
    `)

    expect(template!.content).toMatch(Comment.vForAndVIf)
  })

  test('v-bind="object" is now order-sensitive', () => {
    const { template } = sfcTransform(`
    <template>
      <div>
        <div id="red" v-bind="{ id: 'blue' }"></div>
      </div>
    </template>
    `)

    const { content } = template!
    expect(content.indexOf('red') > content.indexOf('blue')).toBe(true)
  })

  test('v-on:event.native modifier has been removed  ', () => {
    const { template } = sfcTransform(`
    <template>
      <my-component
        v-on:close="handleComponentEvent"
        v-on:click.native="handleNativeClickEvent"
        @mouseup.native="handleNativeMouseUpEvent"
      />
    </template>
    `)

    const { content } = template!
    expect(content).not.toMatch('.native')
    expect(content).toMatch('v-on:click="handleNativeClickEvent"')
    expect(content).toMatch('@mouseup="handleNativeMouseUpEvent"')
  })

  test('$listeners has been removed / merged into $attrs  ', () => {
    const { template } = sfcTransform(`
    <template>
      <label>
        <input type="text" v-bind="$attrs" v-on="$listeners" />
      </label>
    </template>
    `)

    expect(template!.content).not.toMatch('$listeners')
  })

  test('$attrs now includes class and style attributes', () => {
    const { template } = sfcTransform(`
    <template>
      <label>
        <input type="text" v-bind="$attrs" />
      </label>
    </template>
    <script>
    export default {
      inheritAttrs: false
    }
    </script>
    `)

    expect(template!.content).toMatch(Comment.inheritAttrsFalse)
  })

  test('Special is attribute usage is restricted to the reserved <component> tag only  ', () => {
    const { template } = sfcTransform(`
    <template>
      <table>
        <tr is="blog-post-row"></tr>
      </table>
    </template>
    `)

    const { content } = template!
    expect(content).not.toMatch('<tr')
    expect(content).toMatch('<component')
  })
})
