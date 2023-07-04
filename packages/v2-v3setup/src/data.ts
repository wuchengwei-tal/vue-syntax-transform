export const LifeCircleHookMap = {
  beforeMount: 'onBeforeMount',
  mounted: 'onMounted',
  beforeUpdate: 'onBeforeUpdate',
  updated: 'onUpdated',
  activated: 'onActivated',
  deactivated: 'onDeactivated',
  beforeDestroy: 'onBeforeUnmount',
  destroyed: 'onUnmounted',
  beforeRouteEnter: 'onBeforeRouteUpdate',
  beforeRouteLeave: 'onBeforeRouteLeave',
  beforeCreate: '',
  created: ''
}

export const RenderFunction = 'RenderFunction'

export const Comment = {
  vForAndVIf: `\r<!-- It is recommended to avoid using both on the same element due to the syntax ambiguity. Rather than managing this at the template level, one method for accomplishing this is to create a computed property that filters out a list for the visible elements.-->\n`,
  inheritAttrsFalse: `\r<!-- If you previously relied on the special behavior of class and style, some visuals might be broken as these attributes might now be applied to another element. -->\n`
}

export type VModel = {
  exist: boolean
  prop: string
  event: string
}
