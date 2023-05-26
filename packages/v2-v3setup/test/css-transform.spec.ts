import { expect } from 'vitest'
import { cssTransform } from '../src/css-transform'

describe('css transform', () => {
  it('should transform deep', () => {
    const res = cssTransform(`
     /deep/ .foo {
         width: 100px;

         /deep/ .bar {
                height: 100px;
         }
     }
    `)

    expect(res).toMatchSnapshot()
  })

  it('should transform px', () => {
    const res = cssTransform(`
.v-enter,
.v-leave-to {
  opacity: 0;
}

.v-leave,
.v-enter-to {
  opacity: 1;
}
`)

    expect(res).toMatchSnapshot()
  })
})
