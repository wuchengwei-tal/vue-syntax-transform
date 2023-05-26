export enum BindingTypes {
  /**
   * returned from data()
   */
  DATA = 'data',
  /**
   * declared as a prop
   */
  PROPS = 'props',
  /**
   * a let binding
   */
  LET = 'let',
  /**
   * a const binding that.
   */
  CONST = 'const',

  COMPUTED = 'computed',

  FILTER = 'filter',

  METHOD = 'method',

  WATCH = 'watch',

  HOOK = 'hook',

  $ = '$'
}

export type BindingMap<T> = Record<string, { type: BindingTypes; value: T }>

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

export const WalkOrder = [
  'data',
  'methods',
  'computed',
  'filter',
  'watch',
  ...Object.keys(LifeCircleHookMap)
]

export const OutputOrder = [
  BindingTypes.CONST,
  BindingTypes.LET,
  BindingTypes.PROPS,
  BindingTypes.DATA,
  BindingTypes.COMPUTED,
  BindingTypes.FILTER,
  BindingTypes.METHOD
]

export const RenderFunction = 'RenderFunction'

export const Comment = {
  vForAndVIf: `\r<!-- It is recommended to avoid using both on the same element due to the syntax ambiguity. Rather than managing this at the template level, one method for accomplishing this is to create a computed property that filters out a list for the visible elements.-->\n`,
  inheritAttrsFalse: `\r<!-- If you previously relied on the special behavior of class and style, some visuals might be broken as these attributes might now be applied to another element. -->\n`
}
