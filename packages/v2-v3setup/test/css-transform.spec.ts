import { sfcTransform } from '../src'

describe('css transform', () => {
  it('should transform deep', () => {
    const { styles } = sfcTransform(`
    <style lang="" scoped>
     /deep/ .foo {
         width: 100px;

         /deep/ .bar {
                height: 100px;
         }
     }
     </style>
    `)

    expect(styles![0]).toMatchSnapshot()
  })

  it('should transform transition name', () => {
    const { styles } = sfcTransform(`
    <style>
    .v-enter,
    .v-leave-to {
      opacity: 0;
    }

    .v-leave,
    .v-enter-to {
      opacity: 1;
    }
    </style>
    `)
    expect(styles![0]).toMatchSnapshot()
  })

  it('should transform linked style', () => {
    const { styles } = sfcTransform(`
    <style lang="less" src="../styles/bar.less"></style>
    `)
    expect(styles![0]).toEqual(undefined)
  })
})
