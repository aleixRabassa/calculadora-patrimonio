import { useMemo } from 'react'
import { Area, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { calcularHipoteca, generateAmortizationSchedule } from '../utils/calculations'
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
}

const DEFAULT_STATE: HipotecaState = {
  propertyPrice: 200_000,
  parkingPrice: 0,
  financingPct: 80,
  itpPct: 10,
  termYears: 30,
  interestRate: 3,
}

interface ChartPoint {
  month: number
  label: string
  outstandingPrincipal: number
  accumulatedPrincipal: number
  accumulatedInterest: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>
  label?: number
  chartData: ChartPoint[]
}

function HipotecaChartTooltip({ active, payload, label, chartData }: ChartTooltipProps) {
  if (!active || !payload?.length || label == null) return null
  const point = chartData[label]
  if (!point) return null

  const outstanding = payload.find(p => p.dataKey === 'outstandingPrincipal')?.value
  const principal = payload.find(p => p.dataKey === 'accumulatedPrincipal')?.value
  const interest = payload.find(p => p.dataKey === 'accumulatedInterest')?.value

  const years = Math.floor(point.month / 12)
  const months = point.month % 12
  const timeLabel = years > 0
    ? `Año ${years}${months > 0 ? `, mes ${months}` : ''}`
    : `Mes ${months}`

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__date">{timeLabel}</div>
      {typeof outstanding === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: '#e53e3e' }} />
          <span className="chart-tooltip__label">Capital pendiente</span>
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

  const totalPrice = state.propertyPrice + state.parkingPrice
  const financedAmount = totalPrice * (state.financingPct / 100)
  const downPayment = totalPrice - financedAmount
  const itpAmount = totalPrice * (state.itpPct / 100)
  const totalEntry = downPayment + itpAmount

  const hipoteca = calcularHipoteca(totalPrice, downPayment, state.interestRate, state.termYears)

  const chartData: ChartPoint[] = useMemo(() => {
    const schedule = generateAmortizationSchedule(hipoteca.capital, state.interestRate, state.termYears)
    return schedule.map((point, idx) => ({
      ...point,
      label: `${Math.floor(point.month / 12)}a ${point.month % 12}m`,
      month: idx,
    }))
  }, [hipoteca.capital, state.interestRate, state.termYears])

  const xInterval = (() => {
    if (state.termYears <= 5) return 11
    if (state.termYears <= 10) return 23
    if (state.termYears <= 20) return 47
    return 59
  })()

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
          <label htmlFor="parkingPrice">Parking + Trastero</label>
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
              min={0}
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
              Aportación propia {fmt(downPayment)} € + ITP {fmt(itpAmount)} €
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="termYears">Plazo de la hipoteca</label>
          <div className="input-group">
            <input
              id="termYears"
              type="number"
              min={1}
              max={40}
              step={1}
              value={state.termYears}
              onFocus={e => e.target.select()}
              onChange={e => setState(prev => ({ ...prev, termYears: Number(e.target.value) }))}
            />
            <span className="suffix">años</span>
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
      </div>

      <div className="hipoteca__charts">
        <h3>Amortización a {state.termYears} años</h3>
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}>
              <XAxis
                dataKey="month"
                tickFormatter={m => {
                  const realMonth = chartData[m]?.month ?? m
                  const originalMonth = Math.round((realMonth / (chartData.length - 1)) * state.termYears * 12)
                  return `${Math.round(originalMonth / 12)}a`
                }}
                interval={xInterval}
                tick={{ fontSize: 12, dy: 5 }}
              />
              <YAxis
                tickFormatter={v => {
                  const k = v / 1000
                  return `${Math.round(k)}k€`
                }}
                tick={{ fontSize: 12 }}
                width={55}
              />
              <Tooltip content={(props) => <HipotecaChartTooltip {...(props as unknown as ChartTooltipProps)} chartData={chartData} />} />
              <Legend
                formatter={v => {
                  if (v === 'outstandingPrincipal') return 'Capital pendiente'
                  if (v === 'accumulatedPrincipal') return 'Capital amortizado'
                  return 'Intereses pagados'
                }}
                wrapperStyle={{ fontSize: 14, textAlign: 'center' }}
              />
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
