import { useMemo, useState } from 'react'
import { Area, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { generateInvestmentSchedule } from '../utils/calculations'
import './Inversion.css'
import './Ingresos.css'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtPct = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const HORIZON_OPTIONS = [1, 2, 5, 10, 20, 30] as const

const DEFAULT_COLORS = [
  '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316',
]

interface InvestmentItem {
  id: string
  descripcion: string
  capitalInicial: number
  aportacionMensual: number
  rentabilidadAnual: number
  color: string
}

interface InversionState {
  inversiones: InvestmentItem[]
}

const DEFAULT_STATE: InversionState = {
  inversiones: [
    { id: 'inv-1', descripcion: 'ETF Global (MSCI World)', capitalInicial: 10_000, aportacionMensual: 300, rentabilidadAnual: 7, color: '#7c3aed' },
    { id: 'inv-2', descripcion: 'Renta fija', capitalInicial: 5_000, aportacionMensual: 100, rentabilidadAnual: 3, color: '#10b981' },
  ],
}

interface ChartPoint {
  month: number
  label: string
  total: number
  totalContributed: number
  [key: string]: number | string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: string; value?: unknown; color?: string; name?: string }>
  label?: number
  inversiones: InvestmentItem[]
}

function formatFutureMonth(monthsFromNow: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + monthsFromNow)
  const str = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function InversionChartTooltip({ active, payload, label, inversiones }: ChartTooltipProps) {
  if (!active || !payload?.length || label == null) return null

  const totalValue = payload.find(p => p.dataKey === 'total')?.value
  const totalContributed = payload.find(p => p.dataKey === 'totalContributed')?.value

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__date">{formatFutureMonth(label)}</div>
      {inversiones.map(inv => {
        const val = payload.find(p => p.dataKey === `inv_${inv.id}`)?.value
        if (typeof val !== 'number') return null
        return (
          <div key={inv.id} className="chart-tooltip__row">
            <span className="chart-tooltip__dot" style={{ background: inv.color }} />
            <span className="chart-tooltip__label">{inv.descripcion || 'Sin nombre'}</span>
            <span className="chart-tooltip__value">{fmt(val)} €</span>
          </div>
        )
      })}
      {typeof totalValue === 'number' && (
        <div className="chart-tooltip__row" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
          <span className="chart-tooltip__dot" style={{ background: 'var(--text-h)' }} />
          <span className="chart-tooltip__label"><strong>Total</strong></span>
          <span className="chart-tooltip__value"><strong>{fmt(totalValue)} €</strong></span>
        </div>
      )}
      {typeof totalContributed === 'number' && typeof totalValue === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'transparent' }} />
          <span className="chart-tooltip__label">Aportado</span>
          <span className="chart-tooltip__value">{fmt(totalContributed)} € · +{fmtPct(((totalValue - totalContributed) / Math.max(totalContributed, 1)) * 100)}%</span>
        </div>
      )}
    </div>
  )
}

function xAxisInterval(years: number): number {
  if (years <= 1) return 2
  if (years <= 2) return 5
  if (years <= 5) return 11
  if (years <= 10) return 23
  return 47
}

export function Inversion() {
  const [state, setState] = useLocalStorage<InversionState>('calc.inversion', DEFAULT_STATE)
  const [horizonYears, setHorizonYears] = useState<number>(10)

  const inversiones = useMemo(() => state.inversiones ?? [], [state.inversiones])
  const months = horizonYears * 12

  const chartData = useMemo(() => {
    if (inversiones.length === 0) return []

    const schedules = inversiones.map(inv =>
      generateInvestmentSchedule(inv.capitalInicial, inv.aportacionMensual, inv.rentabilidadAnual, months)
    )

    const data: ChartPoint[] = []
    for (let m = 0; m <= months; m++) {
      const year = Math.floor(m / 12)
      const month = m % 12
      const point: ChartPoint = { month: m, label: `${year}a ${month}m`, total: 0, totalContributed: 0 }

      for (let i = 0; i < inversiones.length; i++) {
        const schedule = schedules[i]
        const sp = schedule[m]
        if (sp) {
          point[`inv_${inversiones[i].id}`] = sp.value
          point.total += sp.value
          point.totalContributed += sp.contributed
        }
      }

      data.push(point)
    }
    return data
  }, [inversiones, months])

  const totalCapitalInicial = inversiones.reduce((s, inv) => s + inv.capitalInicial, 0)
  const totalAportacionMensual = inversiones.reduce((s, inv) => s + inv.aportacionMensual, 0)
  const lastPoint = chartData[chartData.length - 1]
  const totalFinalValue = lastPoint?.total ?? 0
  const totalContributed = lastPoint?.totalContributed ?? 0
  const totalReturns = totalFinalValue - totalContributed

  const addInversion = () => {
    const colorIdx = inversiones.length % DEFAULT_COLORS.length
    setState(prev => ({
      ...prev,
      inversiones: [...(prev.inversiones ?? []), {
        id: crypto.randomUUID(),
        descripcion: '',
        capitalInicial: 0,
        aportacionMensual: 0,
        rentabilidadAnual: 7,
        color: DEFAULT_COLORS[colorIdx],
      }],
    }))
  }

  const removeInversion = (id: string) => {
    setState(prev => ({ ...prev, inversiones: (prev.inversiones ?? []).filter(i => i.id !== id) }))
  }

  const updateInversion = (id: string, field: keyof InvestmentItem, value: string | number) => {
    setState(prev => ({
      ...prev,
      inversiones: (prev.inversiones ?? []).map(i => i.id === id ? { ...i, [field]: value } : i),
    }))
  }

  return (
    <section className="inversion">
      <div className="inversion__top">
        <div className="inversion__form">
          <h2>Cartera de Inversión</h2>

          <div className="inversion__summary">
            <div className="summary-card">
              <div className="summary-card__label">Capital invertido</div>
              <div className="summary-card__value">{fmt(totalCapitalInicial)} €</div>
            </div>
            <div className="summary-card">
              <div className="summary-card__label">Aportación mensual</div>
              <div className="summary-card__value">{fmt(totalAportacionMensual)} €/mes</div>
            </div>
            <div className="summary-card">
              <div className="summary-card__label">Valor a {horizonYears} {horizonYears === 1 ? 'año' : 'años'}</div>
              <div className="summary-card__value summary-card__value--accent">{fmt(totalFinalValue)} €</div>
            </div>
            <div className="summary-card">
              <div className="summary-card__label">Rentabilidad acumulada</div>
              <div className={`summary-card__value ${totalReturns >= 0 ? 'summary-card__value--pos' : 'summary-card__value--neg'}`}>
                {totalReturns >= 0 ? '+' : ''}{fmt(totalReturns)} €
                <div className={`summary-card__detail ${totalReturns >= 0 ? 'summary-card__detail--pos' : 'summary-card__detail--neg'}`}>
                  {totalReturns >= 0 ? '+' : ''}{fmtPct(totalContributed > 0 ? (totalReturns / totalContributed) * 100 : 0)}% sobre aportado
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="inversion__charts">
          <div className="charts__header">
            <h3>Proyección a {horizonYears} {horizonYears === 1 ? 'año' : 'años'}</h3>
            <div className="horizon-selector">
              {HORIZON_OPTIONS.map(y => (
                <button
                  key={y}
                  type="button"
                  className={`horizon-btn${horizonYears === y ? ' horizon-btn--active' : ''}`}
                  onClick={() => setHorizonYears(y)}
                >
                  {y}a
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}>
              <XAxis
                dataKey="month"
                tickFormatter={m => {
                  if (horizonYears <= 2) {
                    const d = new Date()
                    d.setDate(1)
                    d.setMonth(d.getMonth() + m)
                    const raw = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
                    const month = raw.charAt(0).toUpperCase() + raw.slice(1)
                    const year = String(d.getFullYear()).slice(2)
                    return `${month} ${year}`
                  }
                  const d2 = new Date()
                  d2.setDate(1)
                  d2.setMonth(d2.getMonth() + m)
                  return String(d2.getFullYear())
                }}
                interval={xAxisInterval(horizonYears)}
                tick={{ fontSize: 12, dy: 5 }}
              />
              <YAxis
                tickFormatter={v => {
                  if (v >= 1_000_000) {
                    const m = v / 1_000_000
                    return `${m.toFixed(1).replace('.0', '').replace('.', ',')}M€`
                  }
                  if (v >= 1000) {
                    const k = v / 1000
                    return `${Math.round(k)}k€`
                  }
                  return `${Math.round(v)}€`
                }}
                tick={{ fontSize: 12 }}
                width={55}
              />
              <Tooltip content={(props) => <InversionChartTooltip {...(props as unknown as ChartTooltipProps)} inversiones={inversiones} />} />
              <Legend
                formatter={v => {
                  if (v === 'totalContributed') return 'Total aportado'
                  const inv = inversiones.find(i => `inv_${i.id}` === v)
                  return inv?.descripcion || 'Inversión'
                }}
                wrapperStyle={{ fontSize: 13, textAlign: 'center', width: '100%', left: 0 }}
              />
              {inversiones.map(inv => (
                <Area
                  key={inv.id}
                  type="monotone"
                  dataKey={`inv_${inv.id}`}
                  stackId="investments"
                  fill={`${inv.color}20`}
                  stroke={inv.color}
                  strokeWidth={2}
                  name={`inv_${inv.id}`}
                />
              ))}
              <Area
                type="monotone"
                dataKey="totalContributed"
                fill="none"
                stroke="var(--text)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                name="totalContributed"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="inversion__list-full">
        <table className="inversion-table">
          <thead>
            <tr>
              <th className="inversion-table__col--color" />
              <th className="inversion-table__col--desc">Descripción</th>
              <th className="inversion-table__col--num">Capital inicial</th>
              <th className="inversion-table__col--num">Aport. mensual</th>
              <th className="inversion-table__col--num">Rentabilidad anual</th>
              <th className="inversion-table__col--num">Valor a {horizonYears} {horizonYears === 1 ? 'año' : 'años'}</th>
              <th className="inversion-table__col--action" />
            </tr>
          </thead>
          <tbody>
            {inversiones.map(inv => {
              const schedule = generateInvestmentSchedule(inv.capitalInicial, inv.aportacionMensual, inv.rentabilidadAnual, months)
              const finalValue = schedule[schedule.length - 1]?.value ?? 0
              return (
                <tr key={inv.id}>
                  <td>
                    <input
                      type="color"
                      className="inversion-color"
                      value={inv.color}
                      onChange={e => updateInversion(inv.id, 'color', e.target.value)}
                      title="Color en el gráfico"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="inversion-desc"
                      placeholder="Descripción"
                      value={inv.descripcion}
                      onChange={e => updateInversion(inv.id, 'descripcion', e.target.value)}
                    />
                  </td>
                  <td>
                    <div className="input-group">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={inv.capitalInicial}
                        onFocus={e => e.target.select()}
                        onChange={e => updateInversion(inv.id, 'capitalInicial', Number(e.target.value))}
                      />
                      <span className="suffix">€</span>
                    </div>
                  </td>
                  <td>
                    <div className="input-group">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={inv.aportacionMensual}
                        onFocus={e => e.target.select()}
                        onChange={e => updateInversion(inv.id, 'aportacionMensual', Number(e.target.value))}
                      />
                      <span className="suffix">€/mes</span>
                    </div>
                  </td>
                  <td>
                    <div className="input-group">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={inv.rentabilidadAnual}
                        onFocus={e => e.target.select()}
                        onChange={e => updateInversion(inv.id, 'rentabilidadAnual', Number(e.target.value))}
                      />
                      <span className="suffix">%</span>
                    </div>
                  </td>
                  <td className="inversion-table__final-value">
                    {fmt(finalValue)} €
                  </td>
                  <td>
                    <button type="button" className="btn-remove" onClick={() => removeInversion(inv.id)}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="inversion-table__add-row">
                <button type="button" className="btn-add" onClick={addInversion}>+ Añadir inversión</button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
