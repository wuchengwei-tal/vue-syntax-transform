import { expect } from 'vitest'
import { templateTransform } from '../src/template-transform'
import { Comment } from '../src/data'

describe('Template Directives', () => {
  test('v-model usage on components has been reworked, replacing v-bind.sync', () => {
    const res = templateTransform(`
    <template>
        <ChildComponent :title.sync="pageTitle" :[x]="" >
          <GrandChildComponent :title.sync="pageTitle" />
        </ChildComponent>
    </template>
    `)

    expect(res).not.toMatch('.sync')
    expect(res).toMatch('ChildComponent v-model:title="pageTitle"')
    expect(res).toMatch('GrandChildComponent v-model:title="pageTitle"')
  })

  test('key usage on <template v-for> and non-v-for nodes has changed', () => {
    let res = templateTransform(`
    <template>
      <div>
        <div v-if="condition" key="yes">Yes</div>
        <div v-else key="no">No</div>
      </div>
    </template>
    `)

    expect(res).not.toMatch('key=')

    res = templateTransform(`
    <template>
      <div>
        <template v-for="item in list">
          <div :key="'heading-' + item.id">...</div>
          <span :key="'content-' + item.id">...</span>
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

    expect(res).toMatch(
      '<template v-for="(item, i_item) in list" :key="i_item"'
    )
    expect(res).toMatch(
      '<template v-for="(item1, i_item1) in list1" :key="i_item1"'
    )
    res = res.replace(/\<template .*\>/gm, '')
    expect(res).not.toMatch('key=')
  })

  test('v-if and v-for precedence when used on the same element has changed ', () => {
    const res = templateTransform(`
    <template>
      <div>
        <div v-for="item in list" v-if="bool">
          <div v-if="item.isVisible" :key="item.id">...</div>
          <span v-else :key="item.id">...</span>
        </div>
      </div>
    </template>
    `)
    expect(res).toMatch(Comment.vForAndVIf)
  })

  test('v-bind="object" is now order-sensitive', () => {
    const res = templateTransform(`
    <template>
      <div>
        <div id="red" v-bind="{ id: 'blue' }"></div>
      </div>
    </template>
    `)

    expect(res.indexOf('red') > res.indexOf('blue')).toBe(true)
  })

  test('v-on:event.native modifier has been removed  ', () => {
    const res = templateTransform(`
    <template>
      <my-component
        v-on:close="handleComponentEvent"
        v-on:click.native="handleNativeClickEvent"
        @mouseup.native="handleNativeMouseUpEvent"
      />
    </template>
    `)

    expect(res).not.toMatch('.native')
    expect(res).toMatch('v-on:click="handleNativeClickEvent"')
    expect(res).toMatch('@mouseup="handleNativeMouseUpEvent"')
  })

  test('$listeners has been removed / merged into $attrs  ', () => {
    const res = templateTransform(`
    <template>
      <label>
        <input type="text" v-bind="$attrs" v-on="$listeners" />
      </label>
    </template>
    `)

    expect(res).not.toMatch('$listeners')
  })

  test('$attrs now includes class and style attributes', () => {
    const res = templateTransform(`
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

    expect(res).toMatch(Comment.inheritAttrsFalse)
  })

  test('Special is attribute usage is restricted to the reserved <component> tag only  ', () => {
    const res = templateTransform(`
    <template>
      <table>
        <tr is="blog-post-row"></tr>
      </table>
    </template>
    `)

    expect(res).not.toMatch('<tr')
    expect(res).toMatch('<component')
  })
})
