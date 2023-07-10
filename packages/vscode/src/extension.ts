import { type ExtensionContext, window, commands } from 'vscode'

import { minimalEdit } from './utils'
import { sfcTransform as v2ToV3Setup } from '../../v2-v3setup'
import { reactivityTransform } from '../../reactivity-transform'
import { v3SetupToV2 } from '../../v3setup-v2'

function wrapTag(
  src: string,
  id: string,
  fn: { (src: string, id: string): { content: string } }
) {
  if (!/\.vue|\.js|\.ts$/.test(id)) {
    window.showWarningMessage('Only support [vue|js|ts] file!')
    return { content: '' }
  }
  if (!src) return { content: '' }

  let prefix = ''
  if (!/\.vue/.test(id)) {
    prefix = '<script'
    if (/\.ts/.test(id)) prefix += ' lang="ts"'
    prefix += '>'
    src = prefix + src + '</script>'
  }

  const result = fn(src, id)
  if (prefix) {
    //  remove <script> tag
    result.content = result.content.replace(
      /^<script[^>]*>([\s\S]*)<\/script>$/,
      '$1'
    )
  }

  return result
}

export function activate(context: ExtensionContext) {
  const transform = (
    transformer: (s: string, id: string) => { content: string }
  ) => {
    return async () => {
      const editor = window.activeTextEditor
      if (!editor) return
      const { document } = editor
      if (!document) return
      const src = document.getText()

      const { fileName } = editor.document

      const { content } = wrapTag(src, fileName, transformer)
      const edit = minimalEdit(document, content)
      await editor.edit(editBuilder => {
        editBuilder.replace(edit.range, edit.newText)
      })

      window.showInformationMessage('Done!')
    }
  }
  const disposables = []

  disposables.push(
    commands.registerCommand(
      'vue-transform.reactivityTransform',
      transform(reactivityTransform)
    )
  )

  disposables.push(
    commands.registerCommand(
      'vue-transform.v2ToV3Setup',
      transform(v2ToV3Setup)
    )
  )

  disposables.push(
    commands.registerCommand(
      'vue-transform.v3SetupToV2',
      transform(v3SetupToV2)
    )
  )

  context.subscriptions.push(...disposables)
}

// This method is called when your extension is deactivated
export function deactivate() {}
