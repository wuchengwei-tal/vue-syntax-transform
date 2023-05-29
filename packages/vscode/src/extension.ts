import { type ExtensionContext, window, commands } from 'vscode'

import { minimalEdit } from './utils'
import { sfcTransform as v2ToV3Setup } from '../../v2-v3setup'
import { reactivityTransform } from '../../reactivity-transform'

function wrapTag(
  src: string,
  id: string,
  fn: { (src: string, id: string): { content: string } }
) {
  if (!/\.vue|\.js|\.ts$/.test(id) || !src) return { content: '' }

  let prefix = ''
  let suffix = ''
  if (!/\.vue/.test(id)) {
    prefix = '<script setup'
    suffix = '</script>'
    if (/\.ts/.test(id)) prefix += ' lang="ts"'
    prefix += '>'
  }

  const result = fn(src, id)
  prefix && (result.content = result.content.replace(prefix, ''))
  suffix && (result.content = result.content.replace(suffix, ''))
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

  context.subscriptions.push(...disposables)
}

// This method is called when your extension is deactivated
export function deactivate() {}
