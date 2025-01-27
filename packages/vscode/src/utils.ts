import { type TextDocument, TextEdit, Range, window } from 'vscode'

export function transform(transformer: (s: string, id: string) => string) {
  return async () => {
    const editor = window.activeTextEditor
    if (!editor) return
    const { document } = editor
    if (!document) return
    const src = document.getText()

    const { fileName } = editor.document

    const result = transformer(src, fileName)
    const edit = minimalEdit(document, result)
    await editor.edit(editBuilder => {
      editBuilder.replace(edit.range, edit.newText)
    })

    window.showInformationMessage('Done!')
  }
}

// https://github.com/prettier/prettier-vscode/blob/main/src/PrettierEditService.ts
export function minimalEdit(document: TextDocument, string1: string) {
  const string0 = document.getText()
  // length of common prefix
  let i = 0
  while (
    i < string0.length &&
    i < string1.length &&
    string0[i] === string1[i]
  ) {
    ++i
  }
  // length of common suffix
  let j = 0
  while (
    i + j < string0.length &&
    i + j < string1.length &&
    string0[string0.length - j - 1] === string1[string1.length - j - 1]
  ) {
    ++j
  }
  const newText = string1.substring(i, string1.length - j)
  const pos0 = document.positionAt(i)
  const pos1 = document.positionAt(string0.length - j)

  return TextEdit.replace(new Range(pos0, pos1), newText)
}
