import { expect } from 'vitest'
import { transTemplate, assertCode } from './utils'

describe('Template Directives', () => {
  test('v-model usage on components has been reworked, replacing v-bind.sync', () => {
    const res = transTemplate(`
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
    let res = transTemplate(`
    <template>
      <div>
        <div v-if="condition" key="yes">Yes</div>
        <div v-else key="no">No</div>
      </div>
    </template>
    `)

    expect(res).not.toMatch('key=')

    res = transTemplate(`
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
    const res = transTemplate(`
    <template>
      <div>
        <div v-for="item in list" v-if="bool">
          <div v-if="item.isVisible" :key="item.id">...</div>
          <span v-else :key="item.id">...</span>
        </div>
      </div>
    </template>
    `)
    //
  })

  test('v-bind="object" is now order-sensitive', () => {
    const res = transTemplate(`
    <template>
      <div>
        <div id="red" v-bind="{ id: 'blue' }"></div>
      </div>
    </template>
    `)

    expect(res.indexOf('red') > res.indexOf('blue')).toBe(true)
  })

  test('v-on:event.native modifier has been removed  ', () => {
    const res = transTemplate(`
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
})
