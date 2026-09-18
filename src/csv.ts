export function csvCell(value: unknown): string {
  let text = String(value)
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g,'""')}"`
}
