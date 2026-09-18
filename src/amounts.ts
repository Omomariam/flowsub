// Exact decimal addition for display and exports; Number is only used for chart widths.
export function sumAmounts(values: string[]): string {
  const scale = Math.max(0, ...values.map(v => (v.split('.')[1] || '').length))
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.')
    return sum + BigInt(whole + fraction.padEnd(scale, '0'))
  }, 0n)
  if (!scale) return total.toString()
  const digits = total.toString().padStart(scale + 1, '0')
  return `${digits.slice(0,-scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') || '0'
}
