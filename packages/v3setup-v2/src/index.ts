import { parse } from '@vue/compiler-sfc'
 
import { compileScript } from './compileScript'

export function transform(code: string) {
  const { descriptor } = parse(code)
  return compileScript(descriptor, {
    id: '',
    reactivityTransform: true
  })
}
