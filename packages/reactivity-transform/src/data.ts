export enum ConstantTypes {
  NOT_CONSTANT = 0,
  CAN_SKIP_PATCH = 1,
  CAN_HOIST = 2,
  CAN_STRINGIFY = 3
}

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
   * a local alias of a `<script setup>` destructured prop.
   * the original is stored in __propsAliases of the bindingMetadata object.
   */
  PROPS_ALIASED = 'props-aliased',
  /**
   * a let binding (may or may not be a ref)
   */
  SETUP_LET = 'setup-let',
  /**
   * a const binding that can never be a ref.
   * these bindings don't need `unref()` calls when processed in inlined
   * template expressions.
   */
  SETUP_CONST = 'setup-const',
  /**
   * a const binding that does not need `unref()`, but may be mutated.
   */
  SETUP_REACTIVE_CONST = 'setup-reactive-const',
  /**
   * a const binding that may be a ref.
   */
  SETUP_MAYBE_REF = 'setup-maybe-ref',
  /**
   * bindings that are guaranteed to be refs
   */
  SETUP_REF = 'setup-ref',
  /**
   * declared by other options, e.g. computed, inject
   */
  OPTIONS = 'options'
}

export enum NodeTypes {
  ROOT = 0,
  ELEMENT = 1,
  TEXT = 2,
  COMMENT = 3,
  SIMPLE_EXPRESSION = 4,
  INTERPOLATION = 5,
  ATTRIBUTE = 6,
  DIRECTIVE = 7,
  COMPOUND_EXPRESSION = 8,
  IF = 9,
  IF_BRANCH = 10,
  FOR = 11,
  TEXT_CALL = 12,
  VNODE_CALL = 13,
  JS_CALL_EXPRESSION = 14,
  JS_OBJECT_EXPRESSION = 15,
  JS_PROPERTY = 16,
  JS_ARRAY_EXPRESSION = 17,
  JS_FUNCTION_EXPRESSION = 18,
  JS_CONDITIONAL_EXPRESSION = 19,
  JS_CACHE_EXPRESSION = 20,
  JS_BLOCK_STATEMENT = 21,
  JS_TEMPLATE_LITERAL = 22,
  JS_IF_STATEMENT = 23,
  JS_ASSIGNMENT_EXPRESSION = 24,
  JS_SEQUENCE_EXPRESSION = 25,
  JS_RETURN_STATEMENT = 26
}

// NodeTypes
export const ROOT = 0
export const ELEMENT = 1
export const TEXT = 2
export const COMMENT = 3
export const SIMPLE_EXPRESSION = 4
export const INTERPOLATION = 5
export const ATTRIBUTE = 6
export const DIRECTIVE = 7
export const COMPOUND_EXPRESSION = 8
export const IF = 9
export const IF_BRANCH = 10
export const FOR = 11
export const TEXT_CALL = 12
export const VNODE_CALL = 13
export const JS_CALL_EXPRESSION = 14
export const JS_OBJECT_EXPRESSION = 15
export const JS_PROPERTY = 16
export const JS_ARRAY_EXPRESSION = 17
export const JS_FUNCTION_EXPRESSION = 18
export const JS_CONDITIONAL_EXPRESSION = 19
export const JS_CACHE_EXPRESSION = 20
export const JS_BLOCK_STATEMENT = 21
export const JS_TEMPLATE_LITERAL = 22
export const JS_IF_STATEMENT = 23
export const JS_ASSIGNMENT_EXPRESSION = 24
export const JS_SEQUENCE_EXPRESSION = 25
export const JS_RETURN_STATEMENT = 26

// ConstantTypes
export const NOT_CONSTANT = 0
export const CAN_SKIP_PATCH = 1
export const CAN_HOIST = 2
export const CAN_STRINGIFY = 3

// BindingTypes
export const DATA = 'data'
export const PROPS = 'props'
export const PROPS_ALIASED = 'props-aliased'
export const SETUP_LET = 'setup-let'
export const SETUP_CONST = 'setup-const'
export const SETUP_REACTIVE_CONST = 'setup-reactive-const'
export const SETUP_MAYBE_REF = 'setup-maybe-ref'
export const SETUP_REF = 'setup-ref'
export const OPTIONS = 'options'
