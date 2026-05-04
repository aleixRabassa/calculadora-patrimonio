export const fmtAxisTick = (v: number): string => {
  if (v === 0) return '0€'
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  const fmt = (n: number, suffix: string) =>
    `${sign}${n.toFixed(1).replace('.0', '').replace('.', ',')}${suffix}€`
  if (abs >= 1_000_000_000_000_000_000) return fmt(abs / 1_000_000_000_000_000_000, 'kT')
  if (abs >= 1_000_000_000_000_000) return fmt(abs / 1_000_000_000_000_000, 'T')
  if (abs >= 1_000_000_000_000) return fmt(abs / 1_000_000_000_000, 'kB')
  if (abs >= 1_000_000_000) return fmt(abs / 1_000_000_000, 'B')
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, 'M')
  if (abs >= 1_000) return fmt(abs / 1_000, 'k')
  return `${sign}${Math.round(abs)}€`
}
