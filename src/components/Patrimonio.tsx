import { useMemo, useState } from 'react'
import { Area, Cell, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { calcularHipoteca, calcularSalarioNeto, calcularAhorroInicialEfectivo, generateInvestmentSchedule } from '../utils/calculations'
import type { Country } from '../utils/calculations'
import './Patrimonio.css'
import { fmtAxisTick } from '../utils/format'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtPct = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtVal = (n: number) => n > 1_000_000_000_000 ? <span className="infinity-symbol">∞</span> : fmt(n)
const fmtPctVal = (pct: number) => Math.abs(pct) > 1_000_000 ? <span className="infinity-symbol">∞</span> : fmtPct(pct)

const HORIZON_OPTIONS = [1, 2, 5, 10, 20, 30] as const

function formatFutureMonth(monthsFromNow: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + monthsFromNow)
  const str = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function xAxisInterval(years: number): number {
  if (years <= 1) return 2
  if (years <= 2) return 5
  if (years <= 5) return 11
  if (years <= 10) return 23
  return 47
}

interface NetWorthChartPoint {
  month: number
  netWorth: number
  contributed: number
}

interface NetWorthTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: string; value?: unknown }>
  label?: number
}

function NetWorthTooltip({ active, payload, label }: NetWorthTooltipProps) {
  if (!active || !payload?.length || label == null) return null
  const netWorth = payload.find(p => p.dataKey === 'netWorth')?.value
  const contributed = payload.find(p => p.dataKey === 'contributed')?.value
  if (typeof netWorth !== 'number') return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__date">{formatFutureMonth(label)}</div>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__dot" style={{ background: '#10b981' }} />
        <span className="chart-tooltip__label">Patrimonio neto</span>
        <span className="chart-tooltip__value">{fmtVal(netWorth)} €</span>
      </div>
      {typeof contributed === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'var(--text)', opacity: 0.45, border: '1.5px dashed var(--text)' }} />
          <span className="chart-tooltip__label">Total aportado</span>
          <span className="chart-tooltip__value">
            {fmtVal(contributed)} € · {netWorth > contributed ? '+' : ''}{fmtPctVal(((netWorth - contributed) / Math.max(Math.abs(contributed), 1)) * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}



interface GastoMensual {
  id: string
  descripcion: string
  valor: number
  tipo?: 'mes' | 'año' | 'vez'
}

interface GastoExtraordinario {
  id: string
  descripcion: string
  importe: number
}

interface OtroIngreso {
  id: string
  descripcion: string
  valor: number
}

interface IngresosState {
  brutoAnual: number
  otrosIngresos?: OtroIngreso[]
  gastos: GastoMensual[]
  gastosExtraordinarios?: GastoExtraordinario[]
  ahorroInicial: number
  country: Country
}

interface HipotecaState {
  propertyPrice: number
  parkingPrice: number
  financingPct: number
  itpPct: number
  termYears: number
  interestRate: number
  additionalEntry: number
}

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

const DEFAULT_INGRESOS: IngresosState = {
  brutoAnual: 40_000,
  gastos: [],
  ahorroInicial: 0,
  country: 'spain',
}

const DEFAULT_HIPOTECA: HipotecaState = {
  propertyPrice: 200_000,
  parkingPrice: 0,
  financingPct: 80,
  itpPct: 10,
  termYears: 30,
  interestRate: 3,
  additionalEntry: 0,
}

const DEFAULT_INVERSION: InversionState = {
  inversiones: [],
  inflationPct: 2.5,
}

// Palette for pie slices
const EXPENSE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#06b6d4', '#6366f1', '#ec4899', '#14b8a6',
]
const INCOME_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6', '#f97316']
const SAVINGS_COLOR = '#10b981'
const INVESTMENT_SLICE_COLOR = '#7c3aed'

interface PieTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ name?: string; value?: number; payload?: { fill?: string } }>
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="pie-tooltip">
      <div className="pie-tooltip__label">{item.name}</div>
      <div className="pie-tooltip__value">{fmtVal(item.value ?? 0)} €</div>
    </div>
  )
}

export function Patrimonio() {
  const [ingresosState] = useLocalStorage<IngresosState>('calc.ingresos', DEFAULT_INGRESOS)
  const [hipotecaState] = useLocalStorage<HipotecaState>('calc.hipoteca', DEFAULT_HIPOTECA)
  const [inversionState] = useLocalStorage<InversionState>('calc.inversion', DEFAULT_INVERSION)
  const [horizonYears, setHorizonYears] = useState<number>(10)

  // --- Derived values ---

  const neto = useMemo(
    () => calcularSalarioNeto(ingresosState.brutoAnual, ingresosState.country ?? 'spain'),
    [ingresosState.brutoAnual, ingresosState.country],
  )

  const gastosList = useMemo(() => ingresosState.gastos ?? [], [ingresosState.gastos])
  const totalGastos = gastosList.reduce((s, g) => {
    const tipo = g.tipo ?? 'mes'
    if (tipo === 'vez') return s
    return s + (tipo === 'año' ? g.valor / 12 : g.valor)
  }, 0)

  const totalGastosVez = gastosList.filter(g => g.tipo === 'vez').reduce((s, g) => s + g.valor, 0)
  const totalGastosExtraordinarios = totalGastosVez + (ingresosState.gastosExtraordinarios ?? []).reduce((s, g) => s + g.importe, 0)
  const ahorroInicialEfectivo = calcularAhorroInicialEfectivo(ingresosState.ahorroInicial ?? 0, totalGastosExtraordinarios)

  const totalPrice = hipotecaState.propertyPrice + hipotecaState.parkingPrice
  const financedAmount = totalPrice * (hipotecaState.financingPct / 100)
  const downPayment = totalPrice - financedAmount
  const hipoteca = useMemo(
    () => calcularHipoteca(totalPrice, downPayment, hipotecaState.interestRate, hipotecaState.termYears),
    [totalPrice, downPayment, hipotecaState.interestRate, hipotecaState.termYears],
  )

  const inversiones = useMemo(() => inversionState.inversiones ?? [], [inversionState.inversiones])

  // Find mortgage payment among expenses
  const cuotaHipotecaria = hipoteca.cuotaMensual

  // Total investment contributions per month
  const totalInvestmentContributions = inversiones.reduce((s, inv) => s + inv.aportacionMensual, 0)

  // Monthly savings = neto - all expenses (mortgage is typically in gastos already)
  const ahorroMensual = neto.netoMensual - totalGastos

  // --- 1. Income distribution pie ---
  const incomeDistribution = useMemo(() => {
    const slices: Array<{ name: string; value: number; color: string }> = []

    // Individual expenses from gastos list
    for (let i = 0; i < gastosList.length; i++) {
      const g = gastosList[i]
      const absValue = Math.abs(g.valor)
      if (absValue > 0) {
        slices.push({
          name: g.descripcion || `Gasto ${i + 1}`,
          value: Math.round(absValue),
          color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
        })
      }
    }

    // Investment contributions (only non-expense ones, excluding mortgage payments already counted)
    const investmentContribsExcludingMortgage = inversiones
      .filter(inv => inv.aportacionMensual !== 0 && !inv.descripcion.toLowerCase().includes('hipoteca') && !inv.descripcion.toLowerCase().includes('deuda'))
      .reduce((s, inv) => s + Math.abs(inv.aportacionMensual), 0)

    if (investmentContribsExcludingMortgage > 0) {
      slices.push({
        name: 'Aportaciones a inversiones',
        value: Math.round(investmentContribsExcludingMortgage),
        color: INVESTMENT_SLICE_COLOR,
      })
    }

    // Remaining savings
    const totalSliced = slices.reduce((s, sl) => s + sl.value, 0)
    const remaining = neto.netoMensual - totalSliced
    if (remaining > 0) {
      slices.push({
        name: 'Ahorro disponible',
        value: Math.round(remaining),
        color: SAVINGS_COLOR,
      })
    }

    return slices
  }, [gastosList, inversiones, neto.netoMensual])

  // --- 2. Income sources distribution pie ---
  const incomeSourcesDistribution = useMemo(() => {
    const otrosIngresos = ingresosState.otrosIngresos ?? []
    const slices: Array<{ name: string; value: number; color: string }> = []

    // Base salary (gross monthly)
    const salarioMensual = Math.round(ingresosState.brutoAnual / 12)
    if (salarioMensual > 0) {
      slices.push({ name: 'Salario bruto mensual', value: salarioMensual, color: INCOME_COLORS[0] })
    }

    // Each additional income source
    for (let i = 0; i < otrosIngresos.length; i++) {
      const oi = otrosIngresos[i]
      if (oi.valor > 0) {
        slices.push({
          name: oi.descripcion || `Ingreso ${i + 1}`,
          value: Math.round(oi.valor),
          color: INCOME_COLORS[(i + 1) % INCOME_COLORS.length],
        })
      }
    }

    return slices
  }, [ingresosState.brutoAnual, ingresosState.otrosIngresos])

  // --- 3. Investment portfolio pie (absolute values) ---
  const investmentDistribution = useMemo(() => {
    if (inversiones.length === 0) return []
    return inversiones
      .map(inv => ({
        name: inv.descripcion || 'Sin nombre',
        value: Math.round(Math.abs(inv.capitalInicial)),
        color: inv.color,
      }))
      .filter(s => s.value > 0)
  }, [inversiones])

  // --- Net worth calculation ---
  // Avoid double-countingproperty in both activos and inversiones
  const hasPropertyInInversiones = inversiones.some(inv =>
    inv.descripcion.toLowerCase().includes('inmueble') || inv.descripcion.toLowerCase().includes('vivienda'),
  )
  const hasMortgageInInversiones = inversiones.some(inv =>
    inv.descripcion.toLowerCase().includes('hipoteca') || inv.descripcion.toLowerCase().includes('deuda'),
  )

  const adjustedActivos = useMemo(() => {
    let total = ahorroInicialEfectivo > 0 ? ahorroInicialEfectivo : 0
    if (!hasPropertyInInversiones) total += totalPrice
    for (const inv of inversiones) {
      if (inv.capitalInicial > 0) total += inv.capitalInicial
    }
    return total
  }, [ahorroInicialEfectivo, totalPrice, inversiones, hasPropertyInInversiones])

  const adjustedPasivos = useMemo(() => {
    let total = 0
    if (!hasMortgageInInversiones) total += hipoteca.capital
    for (const inv of inversiones) {
      if (inv.capitalInicial < 0) total += Math.abs(inv.capitalInicial)
    }
    return total
  }, [hipoteca.capital, inversiones, hasMortgageInInversiones])

  const adjustedPatrimonio = adjustedActivos - adjustedPasivos

  const inflationPct = inversionState.inflationPct ?? 2.5
  const months = horizonYears * 12

  const netWorthChartData = useMemo<NetWorthChartPoint[]>(() => {
    if (inversiones.length === 0) return []
    const schedules = inversiones.map(inv =>
      generateInvestmentSchedule(inv.capitalInicial, inv.aportacionMensual, inv.rentabilidadAnual, months, inflationPct)
    )
    const data: NetWorthChartPoint[] = []
    for (let m = 0; m <= months; m++) {
      let netWorth = 0
      let contributed = 0
      for (const schedule of schedules) {
        const pt = schedule[m]
        if (pt) {
          netWorth += pt.value
          contributed += pt.contributed
        }
      }
      data.push({ month: m, netWorth, contributed })
    }
    return data
  }, [inversiones, months, inflationPct])

  const lastNetWorthPoint = netWorthChartData[netWorthChartData.length - 1]
  const projectedNetWorth = lastNetWorthPoint?.netWorth ?? 0
  const totalContributedAtHorizon = lastNetWorthPoint?.contributed ?? 0

  return (
    <section className="patrimonio">
      {/* Hero KPIs */}
      <div className="patrimonio__hero">
        <div className="hero-card">
          <span className="hero-card__label">Patrimonio neto</span>
          <span className={`hero-card__value ${adjustedPatrimonio >= 0 ? 'hero-card__value--pos' : 'hero-card__value--neg'}`}>
            {fmtVal(adjustedPatrimonio)} €
          </span>
          <span className="hero-card__detail">Activos − Pasivos</span>
        </div>
        <div className="hero-card">
          <span className="hero-card__label">Salario neto mensual en {ingresosState.country === 'andorra' ? 'Andorra' : 'España'}</span>
          <span className="hero-card__value hero-card__value--accent">{fmtVal(neto.netoMensual)} €</span>
          <span className="hero-card__detail">IRPF efectivo: {fmtPct(neto.tipoEfectivoIRPF)}%</span>
        </div>
        <div className="hero-card">
          <span className="hero-card__label">Ahorro mensual en {ingresosState.country === 'andorra' ? 'Andorra' : 'España'}</span>
          <span className={`hero-card__value ${ahorroMensual >= 0 ? 'hero-card__value--pos' : 'hero-card__value--neg'}`}>
            {fmtVal(ahorroMensual)} €/mes
          </span>
          <span className="hero-card__detail">
            {neto.netoMensual > 0
              ? `${fmtPct((ahorroMensual / neto.netoMensual) * 100)}% del neto`
              : '—'}
          </span>
        </div>
      </div>

      {/* Pie charts */}
      <div className="patrimonio__charts">
        {/* Income sources distribution */}
        <div className="chart-panel">
          <h3 className="chart-panel__title">Distribución de ingresos</h3>
          {incomeSourcesDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={incomeSourcesDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {incomeSourcesDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-panel__legend">
                {incomeSourcesDistribution.map((entry, i) => {
                  const total = incomeSourcesDistribution.reduce((s, e) => s + e.value, 0)
                  return (
                    <div key={i} className="legend-item">
                      <span className="legend-dot" style={{ background: entry.color }} />
                      <span className="legend-label">{entry.name}</span>
                      <span className="legend-value">{fmtVal(entry.value)} €</span>
                      <span className="legend-pct">{fmtPct((entry.value / total) * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="patrimonio__empty">Introduce tu salario en la pestaña Ingresos</p>
          )}
        </div>

        {/* Income distribution */}
        <div className="chart-panel">
          <h3 className="chart-panel__title">Distribución de gastos</h3>
          {incomeDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={incomeDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {incomeDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-panel__legend">
                {incomeDistribution.map((entry, i) => {
                  const total = incomeDistribution.reduce((s, e) => s + e.value, 0)
                  return (
                    <div key={i} className="legend-item">
                      <span className="legend-dot" style={{ background: entry.color }} />
                      <span className="legend-label">{entry.name}</span>
                      <span className="legend-value">{fmtVal(entry.value)} €</span>
                      <span className="legend-pct">{fmtPct((entry.value / total) * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="patrimonio__empty">Introduce tus ingresos y gastos en la pestaña Ingresos</p>
          )}
        </div>

        {/* Investment portfolio */}
        <div className="chart-panel">
          <h3 className="chart-panel__title">Cartera de inversiones</h3>
          {investmentDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={investmentDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {investmentDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-panel__legend">
                {investmentDistribution.map((entry, i) => {
                  const total = investmentDistribution.reduce((s, e) => s + e.value, 0)
                  return (
                    <div key={i} className="legend-item">
                      <span className="legend-dot" style={{ background: entry.color }} />
                      <span className="legend-label">{entry.name}</span>
                      <span className="legend-value">{fmtVal(entry.value)} €</span>
                      <span className="legend-pct">{fmtPct((entry.value / total) * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="patrimonio__empty">Añade inversiones en la pestaña Inversión</p>
          )}
        </div>
      </div>

      {/* Net worth evolution chart */}
      <div className="patrimonio__chart-section">
        <div className="charts__header">
          <div className="charts__header-left">
            <h3>Evolución del patrimonio neto a {horizonYears} {horizonYears === 1 ? 'año' : 'años'}</h3>
            {netWorthChartData.length > 0 && (
              <div className="patrimonio__chart-kpis">
                <span className={`patrimonio__chart-kpi ${projectedNetWorth >= 0 ? 'patrimonio__chart-kpi--pos' : 'patrimonio__chart-kpi--neg'}`}>
                  {fmtVal(projectedNetWorth)} €
                </span>
                {totalContributedAtHorizon !== 0 && (
                  <span className="patrimonio__chart-kpi--muted">
                    {projectedNetWorth >= totalContributedAtHorizon ? '+' : ''}{fmtPctVal(((projectedNetWorth - totalContributedAtHorizon) / Math.max(Math.abs(totalContributedAtHorizon), 1)) * 100)}% del capital aportado
                  </span>
                )}
              </div>
            )}
          </div>
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

        {netWorthChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={netWorthChartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
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
                tickFormatter={fmtAxisTick}
                tick={{ fontSize: 12 }}
                width={60}
              />
              <Tooltip content={props => <NetWorthTooltip {...(props as NetWorthTooltipProps)} />} />
              <Area
                type="monotone"
                dataKey="netWorth"
                fill="#10b98120"
                stroke="#10b981"
                strokeWidth={2.5}
                name="netWorth"
              />
              <Area
                type="monotone"
                dataKey="contributed"
                fill="none"
                stroke="var(--text)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeOpacity={0.45}
                name="contributed"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="patrimonio__empty">Añade activos y deudas en la pestaña Inversión para proyectar el patrimonio</p>
        )}
      </div>

      {/* Detailed breakdown */}
      <div className="patrimonio__breakdown">
        <div className="breakdown-card">
          <h3 className="breakdown-card__title">Activos</h3>
          <div className="breakdown-card__rows">
            {!hasPropertyInInversiones && totalPrice > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label">Inmueble (valor de mercado)</span>
                <span className="breakdown-row__value breakdown-row__value--pos">{fmtVal(totalPrice)} €</span>
              </div>
            )}
            {ahorroInicialEfectivo > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label">Ahorro disponible</span>
                <span className="breakdown-row__value breakdown-row__value--pos">{fmtVal(ahorroInicialEfectivo)} €</span>
              </div>
            )}
            {inversiones.filter(inv => inv.capitalInicial > 0).map(inv => (
              <div key={inv.id} className="breakdown-row">
                <span className="breakdown-row__label">{inv.descripcion || 'Inversión'}</span>
                <span className="breakdown-row__value breakdown-row__value--pos">{fmtVal(inv.capitalInicial)} €</span>
              </div>
            ))}
            <div className="breakdown-row breakdown-row--total">
              <span className="breakdown-row__label">Total activos</span>
              <span className="breakdown-row__value breakdown-row__value--pos">{fmtVal(adjustedActivos)} €</span>
            </div>
          </div>
        </div>

        <div className="breakdown-card">
          <h3 className="breakdown-card__title">Pasivos</h3>
          <div className="breakdown-card__rows">
            {!hasMortgageInInversiones && hipoteca.capital > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label">Hipoteca pendiente</span>
                <span className="breakdown-row__value breakdown-row__value--neg">{fmtVal(hipoteca.capital)} €</span>
              </div>
            )}
            {inversiones.filter(inv => inv.capitalInicial < 0).map(inv => (
              <div key={inv.id} className="breakdown-row">
                <span className="breakdown-row__label">{inv.descripcion || 'Deuda'}</span>
                <span className="breakdown-row__value breakdown-row__value--neg">{fmtVal(Math.abs(inv.capitalInicial))} €</span>
              </div>
            ))}
            {adjustedPasivos === 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label" style={{ fontStyle: 'italic', opacity: 0.6 }}>Sin pasivos registrados</span>
                <span className="breakdown-row__value">0 €</span>
              </div>
            )}
            <div className="breakdown-row breakdown-row--total">
              <span className="breakdown-row__label">Total pasivos</span>
              <span className="breakdown-row__value breakdown-row__value--neg">{fmtVal(adjustedPasivos)} €</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly cashflow summary */}
      <div className="breakdown-card">
        <h3 className="breakdown-card__title">Flujo de caja mensual</h3>
        <div className="breakdown-card__rows">
          <div className="breakdown-row">
            <span className="breakdown-row__label">Salario neto</span>
            <span className="breakdown-row__value breakdown-row__value--pos">{fmtVal(neto.netoMensual)} €</span>
          </div>
          <div className="breakdown-row">
            <span className="breakdown-row__label">Gastos mensuales</span>
            <span className="breakdown-row__value breakdown-row__value--neg">−{fmtVal(totalGastos)} €</span>
          </div>
          {cuotaHipotecaria > 0 && !gastosList.some(g => g.descripcion.toLowerCase().includes('hipoteca')) && (
            <div className="breakdown-row">
              <span className="breakdown-row__label">Cuota hipotecaria</span>
              <span className="breakdown-row__value breakdown-row__value--neg">−{fmtVal(cuotaHipotecaria)} €</span>
            </div>
          )}
          {totalInvestmentContributions > 0 && (
            <div className="breakdown-row">
              <span className="breakdown-row__label">Aportaciones a inversiones</span>
              <span className="breakdown-row__value">{fmtVal(totalInvestmentContributions)} €/mes</span>
            </div>
          )}
          <div className="breakdown-row breakdown-row--total">
            <span className="breakdown-row__label">Ahorro neto</span>
            <span className={`breakdown-row__value ${ahorroMensual >= 0 ? 'breakdown-row__value--pos' : 'breakdown-row__value--neg'}`}>
              {ahorroMensual < 0 ? '−' : ''}{fmtVal(Math.abs(ahorroMensual))} €/mes
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
