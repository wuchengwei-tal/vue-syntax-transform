import { type ExtensionContext, window, commands } from 'vscode'

import { minimalEdit } from './utils'
import { v2ToV3Setup } from '../../v2-v3setup'
import { reactivityTransform } from '../../reactivity-transform'

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

      const { content } = transformer(src, fileName)
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

  context.subscriptions.push(...disposables)
}

// This method is called when your extension is deactivated
export function deactivate() {}
