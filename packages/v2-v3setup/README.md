# [非兼容性改变](https://v3-migration.vuejs.org/zh/breaking-changes/)

> sfc, mixin

# 模板指令

- v-model 指令在组件上的使用已经被重新设计，替换掉了 v-bind.sync x
- 在<template v-for> 和没有 v-for 的节点身上使用 key 发生了变化
- v-if 和 v-for 在同一个元素身上使用时的优先级发生了变化
- v-bind="object" 现在是顺序敏感的
- v-on:event.native 事件修饰符已经被移除

# 组件

- 函数式组件只能通过纯函数进行创建
- 单文件组件 (SFC) <template> 标签的 functional attribute 和函数式组件的 functional 选项已被移除

# 渲染函数

- 渲染函数 API 更改
- $scopedSlots property 已移除，所有插槽都通过 $slots 作为函数暴露
- $listeners 被移除或整合到 $attrs
- $attrs 现在包含 class 和 style attribute

# 自定义元素

- 特殊的 is attribute 的使用被严格限制在被保留的 <component> 标签中

# 其他小改变

- Transition 的一些 class 被重命名

# 被移除的 API
- 过滤器 (filter)
