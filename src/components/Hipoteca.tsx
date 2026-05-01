import { useMemo, useEffect } from 'react'
import { Area, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import {
  calcularHipoteca,
  calcularSalarioNeto,
  generateAmortizationSchedule,
  generateAmortizationScheduleWithContributions,
} from '../utils/calculations'
import type { Country } from '../utils/calculations'
import './Hipoteca.css'
import './Ingresos.css'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtPct = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface HipotecaState {
  propertyPrice: number
  parkingPrice: number
  financingPct: number
  itpPct: number
  termYears: number
  interestRate: number
  annualContribution: number
}

const DEFAULT_STATE: HipotecaState = {
  propertyPrice: 200_000,
  parkingPrice: 0,
  financingPct: 80,
  itpPct: 10,
  termYears: 25,
  interestRate: 3,
  annualContribution: 0,
}

// Minimal Ingresos state shape needed to compute the default monthly savings
interface MinimalIngresosState {
  brutoAnual: number
  gastos?: Array<{ valor: number }>
  country?: Country
}

const INGRESOS_FALLBACK: MinimalIngresosState = { brutoAnual: 43_000, gastos: [], country: 'spain' }

interface ChartPoint {
  month: number
  label: string
  outstandingPrincipal: number
  outstandingPrincipalBase?: number
  accumulatedPrincipal: number
  accumulatedInterest: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>
  label?: number
  chartData: ChartPoint[]
  hasContributions: boolean
}

function HipotecaChartTooltip({ active, payload, label, chartData, hasContributions }: ChartTooltipProps) {
  if (!active || !payload?.length || label == null) return null
  const point = chartData[label]
  if (!point) return null

  const outstanding = payload.find(p => p.dataKey === 'outstandingPrincipal')?.value
  const outstandingBase = payload.find(p => p.dataKey === 'outstandingPrincipalBase')?.value
  const principal = payload.find(p => p.dataKey === 'accumulatedPrincipal')?.value
  const interest = payload.find(p => p.dataKey === 'accumulatedInterest')?.value

  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() + point.month, 1)
  const rawLabel = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const timeLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__date">{timeLabel}</div>
      {hasContributions && typeof outstandingBase === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'rgba(229, 62, 62, 0.4)' }} />
          <span className="chart-tooltip__label">Capital pendiente (sin amort.)</span>
          <span className="chart-tooltip__value">{fmt(outstandingBase)} €</span>
        </div>
      )}
      {typeof outstanding === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: '#e53e3e' }} />
          <span className="chart-tooltip__label">
            Capital pendiente{hasContributions ? ' (con amort.)' : ''}
          </span>
          <span className="chart-tooltip__value">{fmt(outstanding)} €</span>
        </div>
      )}
      {typeof principal === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'rgb(99, 200, 132)' }} />
          <span className="chart-tooltip__label">Capital amortizado</span>
          <span className="chart-tooltip__value">{fmt(principal)} €</span>
        </div>
      )}
      {typeof interest === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: '#f6ad55' }} />
          <span className="chart-tooltip__label">Intereses pagados</span>
          <span className="chart-tooltip__value">{fmt(interest)} €</span>
        </div>
      )}
    </div>
  )
}

export function Hipoteca() {
  const [state, setState] = useLocalStorage<HipotecaState>('calc.hipoteca', DEFAULT_STATE)

  // Read Ingresos state to derive the default monthly savings
  const [ingresosState] = useLocalStorage<MinimalIngresosState>('calc.ingresos', INGRESOS_FALLBACK)
  const ingresosExpenses = (ingresosState.gastos ?? []).reduce((s, g) => s + g.valor, 0)
  const ingresosNet = calcularSalarioNeto(ingresosState.brutoAnual, ingresosState.country ?? 'spain')
  const defaultAhorroMensual = Math.max(0, ingresosNet.netoMensual - ingresosExpenses)

  // Migration: initialise contribution field when absent (new field on existing state).
  useEffect(() => {
    if (state.annualContribution == null) {
      setState(prev => ({
        ...prev,
        annualContribution: Math.max(0, Math.round(defaultAhorroMensual * 12)),
      }))
    }
  }, [state.annualContribution, setState, defaultAhorroMensual])

  const totalPrice = state.propertyPrice + state.parkingPrice
  const financedAmount = totalPrice * (state.financingPct / 100)
  const downPayment = totalPrice - financedAmount
  const itpAmount = totalPrice * (state.itpPct / 100)
  const purchaseCosts = totalPrice * 0.01
  const totalEntry = downPayment + itpAmount + purchaseCosts

  const hipoteca = calcularHipoteca(totalPrice, downPayment, state.interestRate, state.termYears)

  // Contribution totals
  const annualExtraPayment = state.annualContribution ?? 0
  const hasContributions = annualExtraPayment > 0

  // Enhanced amortization schedule (with contributions applied annually on Jan 1st)
  const enhancedSchedule = useMemo(() => {
    if (!hasContributions || hipoteca.capital <= 0) return null
    return generateAmortizationScheduleWithContributions(
      hipoteca.capital,
      state.interestRate,
      state.termYears,
      annualExtraPayment,
      0,
      new Date().getMonth(),
    )
  }, [hasContributions, hipoteca.capital, state.interestRate, state.termYears, annualExtraPayment])

  // Savings vs original schedule
  const payoffInfo = useMemo(() => {
    if (!enhancedSchedule || enhancedSchedule.length === 0) return null
    const lastPoint = enhancedSchedule[enhancedSchedule.length - 1]
    const monthsSaved = state.termYears * 12 - lastPoint.month
    const interestSaved = hipoteca.interesesTotales - lastPoint.accumulatedInterest
    return { enhancedMonths: lastPoint.month, monthsSaved, interestSaved }
  }, [enhancedSchedule, state.termYears, hipoteca.interesesTotales])

  const chartData: ChartPoint[] = useMemo(() => {
    const baseSchedule = generateAmortizationSchedule(hipoteca.capital, state.interestRate, state.termYears)

    if (!enhancedSchedule) {
      return baseSchedule.map((point, idx) => ({
        ...point,
        label: `${Math.floor(point.month / 12)}a ${point.month % 12}m`,
        month: idx,
      }))
    }

    const lastEnh = enhancedSchedule[enhancedSchedule.length - 1]
    return baseSchedule.map((basePoint, idx) => {
      const enhPoint = enhancedSchedule[idx]
      return {
        month: idx,
        label: `${Math.floor(basePoint.month / 12)}a ${basePoint.month % 12}m`,
        outstandingPrincipal: enhPoint ? enhPoint.outstandingPrincipal : 0,
        outstandingPrincipalBase: basePoint.outstandingPrincipal,
        accumulatedPrincipal: enhPoint ? enhPoint.accumulatedPrincipal : lastEnh.accumulatedPrincipal,
        accumulatedInterest: enhPoint ? enhPoint.accumulatedInterest : lastEnh.accumulatedInterest,
      }
    })
  }, [hipoteca.capital, state.interestRate, state.termYears, enhancedSchedule])

  const startYear = new Date().getFullYear()

  const xInterval = (() => {
    if (state.termYears <= 5) return 11
    if (state.termYears <= 10) return 23
    if (state.termYears <= 20) return 47
    return 59
  })()

  // --- Contribution handlers ---

  return (
    <section className="hipoteca">
      <div className="hipoteca__form">
        <h2>Hipoteca</h2>

        <div className="field">
          <label htmlFor="propertyPrice">Precio de la vivienda</label>
          <div className="input-group">
            <input
              id="propertyPrice"
              type="number"
              min={0}
              step={5000}
              value={state.propertyPrice}
              onFocus={e => e.target.select()}
              onChange={e => setState(prev => ({ ...prev, propertyPrice: Number(e.target.value) }))}
            />
            <span className="suffix">€</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="parkingPrice">Precio del parking/trastero</label>
          <div className="input-group">
            <input
              id="parkingPrice"
              type="number"
              min={0}
              step={1000}
              value={state.parkingPrice}
              onFocus={e => e.target.select()}
              onChange={e => setState(prev => ({ ...prev, parkingPrice: Number(e.target.value) }))}
            />
            <span className="suffix">€</span>
          </div>
        </div>

        <div className="slider-field">
          <label htmlFor="financingPct">Financiación</label>
          <div className="slider-row">
            <input
              id="financingPct"
              type="range"
              min={50}
              max={100}
              step={1}
              value={state.financingPct}
              onChange={e => setState(prev => ({ ...prev, financingPct: Number(e.target.value) }))}
            />
            <span className="slider-value">{state.financingPct}%</span>
          </div>
        </div>

        <div className="slider-field">
          <label htmlFor="itpPct">Impuesto ITP</label>
          <div className="slider-row">
            <input
              id="itpPct"
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={state.itpPct}
              onChange={e => setState(prev => ({ ...prev, itpPct: Number(e.target.value) }))}
            />
            <span className="slider-value">{fmtPct(state.itpPct)}%</span>
          </div>
        </div>

        <div className="field field--computed">
          <label>Entrada necesaria</label>
          <div className="computed-value">
            {fmt(totalEntry)} €
            <span className="detail">
              Aportación propia {fmt(downPayment)} € + ITP {fmt(itpAmount)} € + Gastos {fmt(purchaseCosts)} €
            </span>
          </div>
        </div>

        <div className="slider-field">
          <label htmlFor="termYears">Plazo de la hipoteca</label>
          <div className="slider-row">
            <input
              id="termYears"
              type="range"
              min={10}
              max={40}
              step={1}
              value={state.termYears}
              onChange={e => setState(prev => ({ ...prev, termYears: Number(e.target.value) }))}
            />
            <span className="slider-value">{state.termYears} años</span>
          </div>
        </div>

        <div className="slider-field">
          <label htmlFor="interestRate">Tipo de interés (TIN)</label>
          <div className="slider-row">
            <input
              id="interestRate"
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={state.interestRate}
              onChange={e => setState(prev => ({ ...prev, interestRate: Number(e.target.value) }))}
            />
            <span className="slider-value">{fmtPct(state.interestRate)}%</span>
          </div>
        </div>

        <div className="field field--computed">
          <label>Cuota mensual</label>
          <div className="computed-value">
            {fmt(hipoteca.cuotaMensual)} €/mes
            <span className="detail">
              Capital financiado: {fmt(hipoteca.capital)} € · Intereses totales: {fmt(hipoteca.interesesTotales)} €
            </span>
          </div>
        </div>

        {/* Aportaciones periódicas (annual) */}
        <div className="field">
          <label htmlFor="annualContribution">Aportaciones periódicas</label>
          <div className="input-group">
            <input
              id="annualContribution"
              type="number"
              min={0}
              step={100}
              value={state.annualContribution ?? 0}
              onFocus={e => e.target.select()}
              onChange={e => setState(prev => ({ ...prev, annualContribution: Number(e.target.value) }))}
            />
            <span className="suffix">€/año</span>
          </div>
        </div>

        {/* Savings summary */}
        {payoffInfo && payoffInfo.monthsSaved > 0 && (
          <div className="field field--computed hipoteca__savings">
            <label>Con aportaciones periódicas</label>
            <div className="computed-value">
              {Math.floor(payoffInfo.enhancedMonths / 12)} años
              {payoffInfo.enhancedMonths % 12 > 0 ? ` ${payoffInfo.enhancedMonths % 12} meses` : ''}
              <span className="detail hipoteca__savings-detail">
                {payoffInfo.monthsSaved >= 12
                  ? `${Math.floor(payoffInfo.monthsSaved / 12)} año${Math.floor(payoffInfo.monthsSaved / 12) > 1 ? 's' : ''}${payoffInfo.monthsSaved % 12 > 0 ? ` y ${payoffInfo.monthsSaved % 12} meses` : ''} antes`
                  : `${payoffInfo.monthsSaved} meses antes`}
                {' · '}
                {fmt(Math.max(0, payoffInfo.interestSaved))} € menos en intereses
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="hipoteca__charts">
        <h3>Amortización a {state.termYears} años</h3>
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
              <XAxis
                dataKey="month"
                tickFormatter={m => {
                  const realMonth = chartData[m]?.month ?? m
                  const originalMonth = Math.round((realMonth / (chartData.length - 1)) * state.termYears * 12)
                  return String(startYear + Math.round(originalMonth / 12))
                }}
                interval={xInterval}
                tick={{ fontSize: 12, dy: 5 }}
              />
              <YAxis
                tickFormatter={v => {
                  if (v === 0) return '0€'
                  return `${Math.round(v / 1000)}k€`
                }}
                tick={{ fontSize: 12 }}
                width={55}
              />
              <Tooltip
                content={(props) => (
                  <HipotecaChartTooltip
                    {...(props as unknown as ChartTooltipProps)}
                    chartData={chartData}
                    hasContributions={hasContributions}
                  />
                )}
              />
              <Legend
                formatter={v => {
                  if (v === 'outstandingPrincipalBase') return 'Capital pendiente (sin amort.)'
                  if (v === 'outstandingPrincipal') return hasContributions ? 'Capital pendiente (con amort.)' : 'Capital pendiente'
                  if (v === 'accumulatedPrincipal') return 'Capital amortizado'
                  return 'Intereses pagados'
                }}
                wrapperStyle={{ fontSize: 14, textAlign: 'center' }}
              />
              {hasContributions && (
                <Line
                  type="monotone"
                  dataKey="outstandingPrincipalBase"
                  stroke="rgba(229, 62, 62, 0.35)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  legendType="line"
                />
              )}
              <Area
                type="monotone"
                dataKey="outstandingPrincipal"
                fill="rgba(229, 62, 62, 0.12)"
                stroke="#e53e3e"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="accumulatedPrincipal"
                fill="rgba(99, 200, 132, 0.15)"
                stroke="rgb(99, 200, 132)"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="accumulatedInterest"
                fill="rgba(246, 173, 85, 0.15)"
                stroke="#f6ad55"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
