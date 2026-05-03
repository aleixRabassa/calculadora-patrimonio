import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { calcularHipoteca, calcularSalarioNeto, calcularAhorroInicialEfectivo } from '../utils/calculations'
import type { Country } from '../utils/calculations'
import './Patrimonio.css'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtPct = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// --- Minimal state shapes to read from localStorage ---

interface GastoMensual {
  id: string
  descripcion: string
  valor: number
}

interface GastoExtraordinario {
  id: string
  descripcion: string
  importe: number
}

interface IngresosState {
  brutoAnual: number
  gastos: GastoMensual[]
  gastosExtraordinarios: GastoExtraordinario[]
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
  gastosExtraordinarios: [],
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
const MORTGAGE_COLORS = ['#48bb78', '#e53e3e', '#f6ad55']
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
      <div className="pie-tooltip__value">{fmt(item.value ?? 0)} €</div>
    </div>
  )
}

export function Patrimonio() {
  const [ingresosState] = useLocalStorage<IngresosState>('calc.ingresos', DEFAULT_INGRESOS)
  const [hipotecaState] = useLocalStorage<HipotecaState>('calc.hipoteca', DEFAULT_HIPOTECA)
  const [inversionState] = useLocalStorage<InversionState>('calc.inversion', DEFAULT_INVERSION)

  // --- Derived values ---

  const neto = useMemo(
    () => calcularSalarioNeto(ingresosState.brutoAnual, ingresosState.country ?? 'spain'),
    [ingresosState.brutoAnual, ingresosState.country],
  )

  const gastosList = useMemo(() => ingresosState.gastos ?? [], [ingresosState.gastos])
  const totalGastos = gastosList.reduce((s, g) => s + g.valor, 0)

  const totalGastosExtraordinarios = (ingresosState.gastosExtraordinarios ?? []).reduce((s, g) => s + g.importe, 0)
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
      if (g.valor > 0) {
        slices.push({
          name: g.descripcion || `Gasto ${i + 1}`,
          value: g.valor,
          color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
        })
      }
    }

    // Investment contributions (only non-expense ones, excluding mortgage payments already counted)
    const investmentContribsExcludingMortgage = inversiones
      .filter(inv => inv.aportacionMensual > 0 && !inv.descripcion.toLowerCase().includes('hipoteca') && !inv.descripcion.toLowerCase().includes('deuda'))
      .reduce((s, inv) => s + inv.aportacionMensual, 0)

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

  // --- 2. Mortgage status pie ---
  const mortgageDistribution = useMemo(() => {
    if (hipoteca.capital <= 0) return []
    return [
      { name: 'Capital aportado (entrada)', value: Math.round(downPayment), color: MORTGAGE_COLORS[0] },
      { name: 'Capital pendiente', value: Math.round(hipoteca.capital), color: MORTGAGE_COLORS[1] },
      { name: 'Intereses totales', value: Math.round(hipoteca.interesesTotales), color: MORTGAGE_COLORS[2] },
    ]
  }, [hipoteca.capital, hipoteca.interesesTotales, downPayment])

  // --- 3. Investment portfolio pie (absolute values) ---
  const investmentDistribution = useMemo(() => {
    if (inversiones.length === 0) return []
    return inversiones
      .filter(inv => Math.abs(inv.capitalInicial) > 0 || inv.aportacionMensual > 0)
      .map(inv => ({
        name: inv.descripcion || 'Sin nombre',
        value: Math.abs(inv.capitalInicial),
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

  return (
    <section className="patrimonio">
      {/* Hero KPIs */}
      <div className="patrimonio__hero">
        <div className="hero-card">
          <span className="hero-card__label">Patrimonio neto</span>
          <span className={`hero-card__value ${adjustedPatrimonio >= 0 ? 'hero-card__value--pos' : 'hero-card__value--neg'}`}>
            {fmt(adjustedPatrimonio)} €
          </span>
          <span className="hero-card__detail">Activos − Pasivos</span>
        </div>
        <div className="hero-card">
          <span className="hero-card__label">Salario neto mensual</span>
          <span className="hero-card__value hero-card__value--accent">{fmt(neto.netoMensual)} €</span>
          <span className="hero-card__detail">IRPF efectivo: {fmtPct(neto.tipoEfectivoIRPF)}%</span>
        </div>
        <div className="hero-card">
          <span className="hero-card__label">Ahorro mensual</span>
          <span className={`hero-card__value ${ahorroMensual >= 0 ? 'hero-card__value--pos' : 'hero-card__value--neg'}`}>
            {fmt(ahorroMensual)} €/mes
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
        {/* Income distribution */}
        <div className="chart-panel">
          <h3 className="chart-panel__title">Distribución de ingresos</h3>
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
                      <span className="legend-value">{fmt(entry.value)} €</span>
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

        {/* Mortgage status */}
        <div className="chart-panel">
          <h3 className="chart-panel__title">Estado de la hipoteca</h3>
          {mortgageDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={mortgageDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {mortgageDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-panel__legend">
                {mortgageDistribution.map((entry, i) => {
                  const total = mortgageDistribution.reduce((s, e) => s + e.value, 0)
                  return (
                    <div key={i} className="legend-item">
                      <span className="legend-dot" style={{ background: entry.color }} />
                      <span className="legend-label">{entry.name}</span>
                      <span className="legend-value">{fmt(entry.value)} €</span>
                      <span className="legend-pct">{fmtPct((entry.value / total) * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="patrimonio__empty">Configura tu hipoteca en la pestaña Hipoteca</p>
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
                      <span className="legend-value">{fmt(entry.value)} €</span>
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

      {/* Detailed breakdown */}
      <div className="patrimonio__breakdown">
        <div className="breakdown-card">
          <h3 className="breakdown-card__title">Activos</h3>
          <div className="breakdown-card__rows">
            {!hasPropertyInInversiones && totalPrice > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label">Inmueble (valor de mercado)</span>
                <span className="breakdown-row__value breakdown-row__value--pos">{fmt(totalPrice)} €</span>
              </div>
            )}
            {ahorroInicialEfectivo > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label">Ahorro disponible</span>
                <span className="breakdown-row__value breakdown-row__value--pos">{fmt(ahorroInicialEfectivo)} €</span>
              </div>
            )}
            {inversiones.filter(inv => inv.capitalInicial > 0).map(inv => (
              <div key={inv.id} className="breakdown-row">
                <span className="breakdown-row__label">{inv.descripcion || 'Inversión'}</span>
                <span className="breakdown-row__value breakdown-row__value--pos">{fmt(inv.capitalInicial)} €</span>
              </div>
            ))}
            <div className="breakdown-row breakdown-row--total">
              <span className="breakdown-row__label">Total activos</span>
              <span className="breakdown-row__value breakdown-row__value--pos">{fmt(adjustedActivos)} €</span>
            </div>
          </div>
        </div>

        <div className="breakdown-card">
          <h3 className="breakdown-card__title">Pasivos</h3>
          <div className="breakdown-card__rows">
            {!hasMortgageInInversiones && hipoteca.capital > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-row__label">Hipoteca pendiente</span>
                <span className="breakdown-row__value breakdown-row__value--neg">{fmt(hipoteca.capital)} €</span>
              </div>
            )}
            {inversiones.filter(inv => inv.capitalInicial < 0).map(inv => (
              <div key={inv.id} className="breakdown-row">
                <span className="breakdown-row__label">{inv.descripcion || 'Deuda'}</span>
                <span className="breakdown-row__value breakdown-row__value--neg">{fmt(Math.abs(inv.capitalInicial))} €</span>
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
              <span className="breakdown-row__value breakdown-row__value--neg">{fmt(adjustedPasivos)} €</span>
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
            <span className="breakdown-row__value breakdown-row__value--pos">{fmt(neto.netoMensual)} €</span>
          </div>
          <div className="breakdown-row">
            <span className="breakdown-row__label">Gastos mensuales</span>
            <span className="breakdown-row__value breakdown-row__value--neg">−{fmt(totalGastos)} €</span>
          </div>
          {cuotaHipotecaria > 0 && !gastosList.some(g => g.descripcion.toLowerCase().includes('hipoteca')) && (
            <div className="breakdown-row">
              <span className="breakdown-row__label">Cuota hipotecaria</span>
              <span className="breakdown-row__value breakdown-row__value--neg">−{fmt(cuotaHipotecaria)} €</span>
            </div>
          )}
          {totalInvestmentContributions > 0 && (
            <div className="breakdown-row">
              <span className="breakdown-row__label">Aportaciones a inversiones</span>
              <span className="breakdown-row__value">{fmt(totalInvestmentContributions)} €/mes</span>
            </div>
          )}
          <div className="breakdown-row breakdown-row--total">
            <span className="breakdown-row__label">Ahorro neto</span>
            <span className={`breakdown-row__value ${ahorroMensual >= 0 ? 'breakdown-row__value--pos' : 'breakdown-row__value--neg'}`}>
              {ahorroMensual < 0 ? '−' : ''}{fmt(Math.abs(ahorroMensual))} €/mes
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
