import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Area, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import type { Country } from '../utils/calculations'
import { calcularAhorroInicialEfectivo, calcularHipoteca, calcularSalarioNeto, generateInvestmentSchedule } from '../utils/calculations'
import './Inversion.css'
import './Ingresos.css'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtPct = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const truncate = (str: string, max = 15) => str.length > max ? `${str.slice(0, max)}…` : str

const HORIZON_OPTIONS = [1, 2, 5, 10, 20, 30] as const

const PALETTE_COLORS = [
  '#7c3aed', '#10b981', '#ef4444',
  '#6366f1', '#84cc16', '#f43f5e',
  '#3b82f6', '#f59e0b', '#ec4899',
  '#06b6d4', '#f97316', '#14b8a6',
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
  inflationPct: number
}

interface MinimalHipotecaState {
  propertyPrice: number
  parkingPrice: number
  financingPct: number
  interestRate: number
  termYears: number
}

interface MinimalIngresosState {
  brutoAnual: number
  gastos?: Array<{ valor: number }>
  gastosExtraordinarios?: Array<{ importe: number }>
  ahorroInicial?: number
  country?: Country
}

const DEFAULT_HIPOTECA: MinimalHipotecaState = {
  propertyPrice: 200_000, parkingPrice: 0, financingPct: 80, interestRate: 3, termYears: 30,
}

const DEFAULT_INGRESOS: MinimalIngresosState = {
  brutoAnual: 40_000, gastos: [], gastosExtraordinarios: [], ahorroInicial: 0, country: 'spain',
}

function buildDefaultInversionState(): InversionState {
  let hipotecaState: MinimalHipotecaState = DEFAULT_HIPOTECA
  let ingresosState: MinimalIngresosState = DEFAULT_INGRESOS

  try {
    const stored = localStorage.getItem('calc.hipoteca')
    if (stored) hipotecaState = { ...DEFAULT_HIPOTECA, ...(JSON.parse(stored) as MinimalHipotecaState) }
  } catch { /* use defaults if localStorage is unavailable or corrupted */ }
  try {
    const stored = localStorage.getItem('calc.ingresos')
    if (stored) ingresosState = { ...DEFAULT_INGRESOS, ...(JSON.parse(stored) as MinimalIngresosState) }
  } catch { /* use defaults if localStorage is unavailable or corrupted */ }

  const totalPrice = hipotecaState.propertyPrice + hipotecaState.parkingPrice
  const financedAmount = totalPrice * (hipotecaState.financingPct / 100)
  const additionalEntry = totalPrice - financedAmount
  const hipoteca = calcularHipoteca(totalPrice, additionalEntry, hipotecaState.interestRate, hipotecaState.termYears)

  const totalGastosExtraordinarios = (ingresosState.gastosExtraordinarios ?? []).reduce((s, g) => s + g.importe, 0)
  const ahorroInicialEfectivo = calcularAhorroInicialEfectivo(ingresosState.ahorroInicial ?? 0, totalGastosExtraordinarios)
  const totalGastos = (ingresosState.gastos ?? []).reduce((s, g) => s + g.valor, 0)
  const netoMensual = calcularSalarioNeto(ingresosState.brutoAnual, ingresosState.country ?? 'spain').netoMensual
  const ahorroMensual = netoMensual - totalGastos

  const hipotecaMensual = hipoteca.capital / (hipotecaState.termYears * 12)

  return {
    inversiones: [
      {
        id: 'default-inmueble',
        descripcion: 'Inmueble (activo)',
        capitalInicial: totalPrice,
        aportacionMensual: 0,
        rentabilidadAnual: 2,
        color: '#ef4444',
      },
      {
        id: 'default-hipoteca',
        descripcion: 'Hipoteca (deuda)',
        capitalInicial: -financedAmount,
        aportacionMensual: hipotecaMensual,
        rentabilidadAnual: hipotecaState.interestRate,
        color: '#6366f1',
      },
      {
        id: 'default-ahorro',
        descripcion: 'Ahorro disponible',
        capitalInicial: ahorroInicialEfectivo - additionalEntry,
        aportacionMensual: ahorroMensual - hipotecaMensual,
        rentabilidadAnual: 0,
        color: '#10b981',
      },
    ],
    inflationPct: 2.5,
  }
}

const DEFAULT_STATE: InversionState = buildDefaultInversionState()

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

  const totalValue = payload
    .filter(p => typeof p.dataKey === 'string' && (p.dataKey as string).startsWith('inv_'))
    .reduce((sum, p) => sum + (typeof p.value === 'number' ? p.value : 0), 0)
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
            <span className="chart-tooltip__label">{truncate(inv.descripcion || 'Sin nombre')}</span>
            <span className="chart-tooltip__value">{fmt(val)} €</span>
          </div>
        )
      })}
      {totalValue > 0 && (
        <div className="chart-tooltip__row" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
          <span className="chart-tooltip__dot" style={{ background: 'var(--text-h)' }} />
          <span className="chart-tooltip__label"><strong>Total</strong></span>
          <span className="chart-tooltip__value"><strong>{fmt(totalValue)} €</strong></span>
        </div>
      )}
      {typeof totalContributed === 'number' && totalValue > 0 && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'var(--text)', opacity: 0.45, border: '1.5px dashed var(--text)' }} />
          <span className="chart-tooltip__label">Total aportado</span>
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
  const [openColorId, setOpenColorId] = useState<string | null>(null)

  const [hipotecaState] = useLocalStorage<MinimalHipotecaState>('calc.hipoteca', DEFAULT_HIPOTECA)
  const [ingresosState] = useLocalStorage<MinimalIngresosState>('calc.ingresos', DEFAULT_INGRESOS)

  useEffect(() => {
    if (!openColorId) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.color-picker-wrapper')) {
        setOpenColorId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openColorId])

  const inversiones = useMemo(() => state.inversiones ?? [], [state.inversiones])
  const inflationPct = state.inflationPct ?? 2.5
  const months = horizonYears * 12

  const chartData = useMemo(() => {
    if (inversiones.length === 0) return []

    const schedules = inversiones.map(inv =>
      generateInvestmentSchedule(inv.capitalInicial, inv.aportacionMensual, inv.rentabilidadAnual, months, inflationPct)
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
  }, [inversiones, months, inflationPct])

  const totalCapitalInicial = inversiones.reduce((s, inv) => s + inv.capitalInicial, 0)
  const totalAportacionMensual = inversiones.reduce((s, inv) => s + inv.aportacionMensual, 0)
  const lastPoint = chartData[chartData.length - 1]
  const totalFinalValue = lastPoint?.total ?? 0
  const totalContributed = lastPoint?.totalContributed ?? 0
  const totalReturns = totalFinalValue - totalContributed

  const addInversion = () => {
    const usedColors = new Set(inversiones.map(i => i.color))
    const color = PALETTE_COLORS.find(c => !usedColors.has(c)) ?? PALETTE_COLORS[inversiones.length % PALETTE_COLORS.length]
    setState(prev => ({
      ...prev,
      inversiones: [...(prev.inversiones ?? []), {
        id: crypto.randomUUID(),
        descripcion: '',
        capitalInicial: 0,
        aportacionMensual: 0,
        rentabilidadAnual: 7,
        color,
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

  const addHipotecaAsInversion = () => {
    const totalPrice = hipotecaState.propertyPrice + hipotecaState.parkingPrice
    const financedAmount = totalPrice * (hipotecaState.financingPct / 100)
    const hipoteca = calcularHipoteca(totalPrice, totalPrice - financedAmount, hipotecaState.interestRate, hipotecaState.termYears)

    const usedColors = new Set(inversiones.map(i => i.color))
    const availableColors = PALETTE_COLORS.filter(c => !usedColors.has(c))
    const colorPiso = availableColors[0] ?? PALETTE_COLORS[(inversiones.length) % PALETTE_COLORS.length]
    const colorHipoteca = availableColors[1] ?? PALETTE_COLORS[(inversiones.length + 1) % PALETTE_COLORS.length]

    setState(prev => ({
      ...prev,
      inversiones: [
        ...(prev.inversiones ?? []),
        {
          id: crypto.randomUUID(),
          descripcion: 'Inmueble (activo)',
          capitalInicial: totalPrice,
          aportacionMensual: 0,
          rentabilidadAnual: 2,
          color: colorPiso,
        },
        {
          id: crypto.randomUUID(),
          descripcion: 'Deudas',
          capitalInicial: -financedAmount,
          aportacionMensual: hipoteca.capital / (hipotecaState.termYears * 12),
          rentabilidadAnual: hipotecaState.interestRate,
          color: colorHipoteca,
        },
      ],
    }))
  }

  const addAhorroAsInversion = () => {
    const totalGastosExtraordinarios = (ingresosState.gastosExtraordinarios ?? []).reduce((s, g) => s + g.importe, 0)
    const ahorroInicialEfectivo = calcularAhorroInicialEfectivo(ingresosState.ahorroInicial ?? 0, totalGastosExtraordinarios)

    const totalGastos = (ingresosState.gastos ?? []).reduce((s, g) => s + g.valor, 0)
    const netoMensual = calcularSalarioNeto(ingresosState.brutoAnual, ingresosState.country ?? 'spain').netoMensual
    const ahorroMensual = netoMensual - totalGastos

    const totalPrice = hipotecaState.propertyPrice + hipotecaState.parkingPrice
    const financedAmount = totalPrice * (hipotecaState.financingPct / 100)
    const additionalEntry = totalPrice - financedAmount

    const totalOtherContributions = inversiones.reduce((s, inv) => s + inv.aportacionMensual, 0)

    const capitalInicial = ahorroInicialEfectivo - additionalEntry
    const aportacionMensual = ahorroMensual - totalOtherContributions

    const usedColors = new Set(inversiones.map(i => i.color))
    const color = PALETTE_COLORS.find(c => !usedColors.has(c)) ?? PALETTE_COLORS[inversiones.length % PALETTE_COLORS.length]

    setState(prev => ({
      ...prev,
      inversiones: [
        ...(prev.inversiones ?? []),
        {
          id: crypto.randomUUID(),
          descripcion: 'Ahorro disponible',
          capitalInicial,
          aportacionMensual,
          rentabilidadAnual: 0,
          color,
        },
      ],
    }))
  }

  return (
    <section className="inversion">
      <div className="inversion__top">
        <div className="inversion__form">
          <h2>Cartera de Inversión</h2>

          <div className="inflation-control">
            <div className="inflation-control__header">
              <span className="inflation-control__label">
                Inflación anual
                <span className="col-info" tabIndex={0}>
                  ?
                  <span className="col-info__tooltip">
                    Reduce el valor real del patrimonio con el tiempo.<br />
                    Para ignorar el efecto de la inflación, ponlo a 0%.
                  </span>
                </span>
              </span>
              <span className="inflation-control__value">{fmtPct(inflationPct)}%</span>
            </div>
            <input
              type="range"
              className="inflation-slider"
              min={0}
              max={10}
              step={0.1}
              value={inflationPct}
              style={{ '--pct': `${inflationPct / 10 * 100}%` } as React.CSSProperties}
              onChange={e => setState(prev => ({ ...prev, inflationPct: Number(e.target.value) }))}
            />
            <div className="inflation-control__ticks">
              <span>0%</span>
              <span>5%</span>
              <span>10%</span>
            </div>
          </div>

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
              <div className="summary-card__label">Valor real a {horizonYears} {horizonYears === 1 ? 'año' : 'años'}</div>
              <div className="summary-card__value summary-card__value--accent">
                {fmt(totalFinalValue)} €
                <div className="summary-card__detail">*inflación aplicada</div>
              </div>
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
            <ComposedChart data={chartData} margin={{ top: 8, right: 30, bottom: 8, left: 0 }}>
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
                  if (v === 0) return '0€'
                  return `${Math.round(v / 1000)}k€`
                }}
                tick={{ fontSize: 12 }}
                width={55}
              />
              <Tooltip content={(props) => <InversionChartTooltip {...(props as unknown as ChartTooltipProps)} inversiones={inversiones} />} />
              <Legend
                formatter={v => {
                  if (v === 'totalContributed') return 'Total aportado'
                  const inv = inversiones.find(i => `inv_${i.id}` === v)
                  return truncate(inv?.descripcion || 'Inversión')
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
                strokeOpacity={0.45}
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
              <th className="inversion-table__col--num">
                Capital inicial
                <span className="col-info" tabIndex={0}>
                  ?
                  <span className="col-info__tooltip">
                    Valor del activo en el momento inicial.<br />
                    <br />
                    <strong>Deudas</strong><br />
                    El valor debe ser negativo, ya que representa un pasivo en el patrimonio.
                  </span>
                </span>
              </th>
              <th className="inversion-table__col--num">
                Aport. mensual
                <span className="col-info" tabIndex={0}>
                  ?
                  <span className="col-info__tooltip">
                    <strong>Ahorro</strong><br />
                    Ahorro mensual disponible (neto − gastos) menos el resto de aportaciones.<br />
                    <br />
                    <strong>Deudas</strong><br />
                    Solo la amortización de capital:<br />
                    <em>capital financiado ÷ (años × 12)</em><br />
                    No incluye intereses.
                  </span>
                </span>
              </th>
              <th className="inversion-table__col--num">
                Rentabilidad anual
                <span className="col-info" tabIndex={0}>
                  ?
                  <span className="col-info__tooltip">
                    Rentabilidad esperada anual del activo.<br />
                    <br />
                    <strong>Deudas</strong><br />
                    Equivale al tipo de interés del préstamo, este debe ser positivo.
                  </span>
                </span>
              </th>
              <th className="inversion-table__col--num">Valor real a {horizonYears} {horizonYears === 1 ? 'año' : 'años'}</th>
              <th className="inversion-table__col--action" />
            </tr>
          </thead>
          <tbody>
            {inversiones.map(inv => {
              const schedule = generateInvestmentSchedule(inv.capitalInicial, inv.aportacionMensual, inv.rentabilidadAnual, months, inflationPct)
              const finalValue = schedule[schedule.length - 1]?.value ?? 0
              return (
                <tr key={inv.id}>
                  <td>
                    <div className="color-picker-wrapper">
                      <button
                        className="inversion-color"
                        style={{ background: inv.color }}
                        onClick={() => setOpenColorId(openColorId === inv.id ? null : inv.id)}
                        aria-label="Seleccionar color"
                      />
                      {openColorId === inv.id && (
                        <div className="color-picker-popover">
                          {PALETTE_COLORS.map(c => (
                            <button
                              key={c}
                              className={`color-swatch${inv.color === c ? ' color-swatch--active' : ''}`}
                              style={{ background: c }}
                              onClick={() => { updateInversion(inv.id, 'color', c); setOpenColorId(null) }}
                              aria-label={`Color ${c}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
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
                        value={Math.round(inv.aportacionMensual)}
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
                <button type="button" className="btn-add btn-add--secondary" onClick={addHipotecaAsInversion}>🏠 Añadir hipotecas</button>
                <button type="button" className="btn-add btn-add--secondary" onClick={addAhorroAsInversion}>💰 Añadir ahorro</button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
