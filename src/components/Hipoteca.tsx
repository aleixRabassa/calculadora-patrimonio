import { useMemo, useEffect, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { Area, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import {
  calcularHipoteca,
  calcularSalarioNeto,
  calcularAhorroInicialEfectivo,
  generateAmortizationSchedule,
  generateAmortizationScheduleWithContributions,
} from '../utils/calculations'
import type { Country, ScheduledContribution } from '../utils/calculations'
import './Hipoteca.css'
import './Ingresos.css'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtDec = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface ExtraordinaryContribution {
  id: string
  descripcion: string
  importe: number
  fecha: string // MM/YYYY
}

interface HipotecaState {
  propertyPrice: number
  parkingPrice: number
  financingPct: number
  itpPct: number
  termYears: number
  interestRate: number
  annualContribution?: number
  extraordinaryContributions: ExtraordinaryContribution[]
  amortizationType: 'plazo' | 'cuota'
}

const DEFAULT_STATE: HipotecaState = {
  propertyPrice: 200_000,
  parkingPrice: 0,
  financingPct: 80,
  itpPct: 10,
  termYears: 30,
  interestRate: 3,
  annualContribution: 0,
  extraordinaryContributions: [],
  amortizationType: 'plazo',
}

// Minimal Ingresos state shape needed to compute the default monthly savings
interface MinimalIngresosState {
  brutoAnual: number
  gastos?: Array<{ valor: number }>
  gastosExtraordinarios?: Array<{ importe: number }>
  ahorroInicial?: number
  country?: Country
}

const INGRESOS_FALLBACK: MinimalIngresosState = { brutoAnual: 43_000, gastos: [], gastosExtraordinarios: [], ahorroInicial: 0, country: 'spain' }

interface ChartPoint {
  month: number
  label: string
  outstandingPrincipal: number
  outstandingPrincipalBase?: number
  accumulatedPrincipal: number
  accumulatedInterest: number
  accumulatedPrincipalBase?: number
  accumulatedInterestBase?: number
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
  const principalBase = payload.find(p => p.dataKey === 'accumulatedPrincipalBase')?.value
  const interestBase = payload.find(p => p.dataKey === 'accumulatedInterestBase')?.value

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
            Capital pendiente
          </span>
          <span className="chart-tooltip__value">{fmt(outstanding)} €</span>
        </div>
      )}
      {hasContributions && typeof principalBase === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'rgba(99, 200, 132, 0.4)' }} />
          <span className="chart-tooltip__label">Capital amortizado (sin amort.)</span>
          <span className="chart-tooltip__value">{fmt(principalBase)} €</span>
        </div>
      )}
      {typeof principal === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'rgb(99, 200, 132)' }} />
          <span className="chart-tooltip__label">Capital amortizado</span>
          <span className="chart-tooltip__value">{fmt(principal)} €</span>
        </div>
      )}
      {hasContributions && typeof interestBase === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'rgba(246, 173, 85, 0.4)' }} />
          <span className="chart-tooltip__label">Intereses pagados (sin amort.)</span>
          <span className="chart-tooltip__value">{fmt(interestBase)} €</span>
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
  const annualizedSavings = Math.max(0, Math.round(defaultAhorroMensual * 12))

  // Initialise contribution field when absent (new users or migration).
  useEffect(() => {
    if (state.annualContribution == null) {
      setState(prev => ({ ...prev, annualContribution: annualizedSavings }))
    }
  }, [state.annualContribution, setState, annualizedSavings])

  const isSyncedWithSavings = (state.annualContribution ?? annualizedSavings) === annualizedSavings

  const totalGastosExtraordinarios = (ingresosState.gastosExtraordinarios ?? []).reduce((s, g) => s + g.importe, 0)
  const ahorroInicialEfectivo = calcularAhorroInicialEfectivo(ingresosState.ahorroInicial ?? 0, totalGastosExtraordinarios)

  const totalPrice = state.propertyPrice + state.parkingPrice
  const financedAmount = totalPrice * (state.financingPct / 100)
  const downPayment = totalPrice - financedAmount
  const itpAmount = totalPrice * (state.itpPct / 100)
  const purchaseCosts = totalPrice * 0.01
  const totalEntry = downPayment + itpAmount + purchaseCosts

  const hipoteca = calcularHipoteca(totalPrice, downPayment, state.interestRate, state.termYears)

  // Contribution totals
  const annualExtraPayment = state.annualContribution ?? 0
  const extraordinaryList = state.extraordinaryContributions ?? []
  const hasContributions = annualExtraPayment > 0 || extraordinaryList.some(c => c.importe > 0)

  // Enhanced amortization schedule (with contributions applied annually on Jan 1st)
  const enhancedSchedule = useMemo(() => {
    if (!hasContributions || hipoteca.capital <= 0) return null

    const now = new Date()
    const loanStartMonth = now.getMonth()
    const loanStartYear = now.getFullYear()

    const scheduledContributions: ScheduledContribution[] = (state.extraordinaryContributions ?? [])
      .filter(c => c.importe > 0)
      .flatMap(c => {
        const parts = c.fecha.split('/')
        if (parts.length !== 2) return []
        const month0 = parseInt(parts[0], 10) - 1
        const year = parseInt(parts[1], 10)
        if (isNaN(month0) || isNaN(year) || month0 < 0 || month0 > 11) return []
        const offset = (year - loanStartYear) * 12 + (month0 - loanStartMonth)
        if (offset <= 0 || offset > state.termYears * 12) return []
        return [{ month: offset, amount: c.importe }]
      })

    return generateAmortizationScheduleWithContributions(
      hipoteca.capital,
      state.interestRate,
      state.termYears,
      annualExtraPayment,
      0,
      loanStartMonth,
      state.amortizationType,
      scheduledContributions,
    )
  }, [hasContributions, hipoteca.capital, state.interestRate, state.termYears, annualExtraPayment, state.amortizationType, state.extraordinaryContributions])

  // Savings vs original schedule
  const payoffInfo = useMemo(() => {
    if (!enhancedSchedule || enhancedSchedule.length === 0) return null
    const lastPoint = enhancedSchedule[enhancedSchedule.length - 1]
    const interestSaved = hipoteca.interesesTotales - lastPoint.accumulatedInterest

    if (state.amortizationType === 'cuota') {
      const loanStartMonth = new Date().getMonth()
      const monthsToFirstJan = (12 - loanStartMonth) % 12 || 12
      const n = state.termYears * 12
      const r = state.interestRate / 100 / 12

      // Find the last January where outstanding > 0 after lump sum (the last active recalculated payment)
      let finalPayment: number | null = null
      for (let i = enhancedSchedule.length - 1; i >= 0; i--) {
        const m = enhancedSchedule[i].month
        if (m >= monthsToFirstJan && (m - monthsToFirstJan) % 12 === 0) {
          const outstanding = enhancedSchedule[i].outstandingPrincipal
          const remaining = n - m
          if (remaining > 0 && outstanding > 0.01) {
            finalPayment = r === 0
              ? outstanding / remaining
              : (outstanding * r * Math.pow(1 + r, remaining)) / (Math.pow(1 + r, remaining) - 1)
            break
          }
          // outstanding = 0 here (lump sum cleared the loan): keep searching for the previous January
        }
      }
      return { enhancedMonths: lastPoint.month, monthsSaved: 0, interestSaved, finalPayment }
    }

    const monthsSaved = state.termYears * 12 - lastPoint.month
    return { enhancedMonths: lastPoint.month, monthsSaved, interestSaved, finalPayment: null }
  }, [enhancedSchedule, state.termYears, hipoteca.interesesTotales, state.amortizationType, state.interestRate])

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
        accumulatedPrincipalBase: basePoint.accumulatedPrincipal,
        accumulatedInterestBase: basePoint.accumulatedInterest,
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

  // --- Amortization schedule table ---
  const [scheduleExpanded, setScheduleExpanded] = useState(false)
  const [includeAmortizations, setIncludeAmortizations] = useState(true)

  // Track slider dragging state to defer schedule recalc until release
  const slidingRef = useRef(false)
  const [committedSliderState, setCommittedSliderState] = useState({
    interestRate: state.interestRate,
    termYears: state.termYears,
    financingPct: state.financingPct,
  })

  // Sync committed state when not sliding (e.g. numeric input changes)
  useEffect(() => {
    if (!slidingRef.current) {
      setCommittedSliderState({
        interestRate: state.interestRate,
        termYears: state.termYears,
        financingPct: state.financingPct,
      })
    }
  }, [state.interestRate, state.termYears, state.financingPct])

  const handleSliderCommit = () => {
    slidingRef.current = false
    setCommittedSliderState({
      interestRate: state.interestRate,
      termYears: state.termYears,
      financingPct: state.financingPct,
    })
  }

  const committedCapital = (state.propertyPrice + state.parkingPrice) * (committedSliderState.financingPct / 100)

  const detailedSchedule = useMemo(() => {
    const useEnhanced = includeAmortizations && enhancedSchedule && enhancedSchedule.length > 0
    const schedule = useEnhanced
      ? enhancedSchedule
      : generateAmortizationSchedule(committedCapital, committedSliderState.interestRate, committedSliderState.termYears)
    const now = new Date()
    return schedule.slice(1).map((point, i) => {
      const prev = schedule[i]
      const date = new Date(now.getFullYear(), now.getMonth() + point.month, 1)
      const rawLabel = date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
      return {
        num: point.month,
        date: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
        principal: point.accumulatedPrincipal - prev.accumulatedPrincipal,
        interest: point.accumulatedInterest - prev.accumulatedInterest,
        outstanding: point.outstandingPrincipal,
      }
    })
  }, [committedCapital, committedSliderState.interestRate, committedSliderState.termYears, includeAmortizations, enhancedSchedule])

  // --- Contribution handlers ---
  const [extraordinaryExpanded, setExtraordinaryExpanded] = useState(false)
  const totalExtraordinary = extraordinaryList.reduce((sum, c) => sum + c.importe, 0)

  const addExtraordinaryContribution = () => {
    setState(prev => {
      const list = prev.extraordinaryContributions ?? []
      let nextFecha: string
      if (list.length === 0) {
        nextFecha = `01/${new Date().getFullYear() + 1}`
      } else {
        const lastFecha = list[list.length - 1].fecha
        const year = parseInt(lastFecha.split('/')[1], 10)
        nextFecha = `01/${isNaN(year) ? new Date().getFullYear() + 1 : year + 1}`
      }
      return {
        ...prev,
        extraordinaryContributions: [
          ...list,
          { id: crypto.randomUUID(), descripcion: '', importe: 5000, fecha: nextFecha },
        ],
      }
    })
  }

  const removeExtraordinaryContribution = (id: string) => {
    setState(prev => ({
      ...prev,
      extraordinaryContributions: (prev.extraordinaryContributions ?? []).filter(c => c.id !== id),
    }))
  }

  const updateExtraordinaryContribution = (id: string, field: 'descripcion' | 'importe' | 'fecha', value: string | number) => {
    setState(prev => ({
      ...prev,
      extraordinaryContributions: (prev.extraordinaryContributions ?? []).map(c => c.id === id ? { ...c, [field]: value } : c),
    }))
  }

  const additionalEntry = Math.round(totalPrice * (1 - state.financingPct / 100))
  const isSyncedWithInitialSavings = additionalEntry === Math.round(Math.max(0, ahorroInicialEfectivo))

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
          <label htmlFor="parkingPrice">Precio del parking y trastero</label>
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
              min={30}
              max={120}
              step={1}
              value={state.financingPct}
              onPointerDown={() => { slidingRef.current = true }}
              onPointerUp={handleSliderCommit}
              onChange={e => setState(prev => ({ ...prev, financingPct: Number(e.target.value) }))}
            />
            <span className="slider-value">{fmtPct(state.financingPct)}%</span>
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
          <div className="field__label-row">
            <label>Entrada necesaria</label>
            <button
              type="button"
              className={`sync-link${state.financingPct === 100 ? ' sync-link--synced' : ''}`}
              onClick={() => setState(prev => ({ ...prev, financingPct: 100 }))}
            >
              Sin entrada propia
            </button>
          </div>
          <div className="computed-value">
            {fmt(totalEntry)} €
            <span className="detail">
              Aportación propia {fmt(downPayment)} € + ITP {fmt(itpAmount)} € + Gastos {fmt(purchaseCosts)} €
            </span>
          </div>
        </div>

        <div className="field">
          <div className="field__label-row">
            <label htmlFor="additionalEntry">Aportación propia</label>
            <button
              type="button"
              className={`sync-link${isSyncedWithInitialSavings ? ' sync-link--synced' : ''}`}
              onClick={() => {
                if (totalPrice > 0) {
                  const effective = Math.max(0, ahorroInicialEfectivo)
                  const rawPct = (1 - effective / totalPrice) * 100
                  setState(prev => ({ ...prev, financingPct: Math.max(30, Math.min(120, rawPct)) }))
                }
              }}
            >
              Ahorro actual disponible: {fmt(Math.max(0, ahorroInicialEfectivo))} €
            </button>
          </div>
          <div className="input-group">
            <input
              id="additionalEntry"
              type="number"
              min={0}
              step={1000}
              value={additionalEntry}
              onFocus={e => e.target.select()}
              onChange={e => {
                if (totalPrice <= 0) return
                const euros = Number(e.target.value)
                const rawPct = (1 - euros / totalPrice) * 100
                setState(prev => ({ ...prev, financingPct: Math.max(30, Math.min(120, rawPct)) }))
              }}
            />
            <span className="suffix">€</span>
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
              onPointerDown={() => { slidingRef.current = true }}
              onPointerUp={handleSliderCommit}
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
              onPointerDown={() => { slidingRef.current = true }}
              onPointerUp={handleSliderCommit}
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

        <div className="amortization-type">
          <h3>Amortizaciones</h3>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-control__option${state.amortizationType !== 'cuota' ? ' segmented-control__option--active' : ''}`}
              onClick={() => setState(prev => ({ ...prev, amortizationType: 'plazo' }))}
            >
              Amortizar plazo
            </button>
            <button
              type="button"
              className={`segmented-control__option${state.amortizationType === 'cuota' ? ' segmented-control__option--active' : ''}`}
              onClick={() => setState(prev => ({ ...prev, amortizationType: 'cuota' }))}
            >
              Amortizar cuota
            </button>
          </div>
        </div>

        {/* Aportaciones anuales */}
        <div className="field">
          <div className="field__label-row">
            <label htmlFor="annualContribution">Aportaciones anuales</label>
            <button
              type="button"
              className={`sync-link${isSyncedWithSavings ? ' sync-link--synced' : ''}`}
              onClick={() => setState(prev => ({ ...prev, annualContribution: annualizedSavings }))}
            >
              Ahorro anual disponible: {fmt(annualizedSavings)} €
            </button>
          </div>
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

        {/* Aportaciones extraordinarias (collapsible) */}
        <div className="gastos">
          <button
            type="button"
            className="gastos__header"
            onClick={() => setExtraordinaryExpanded(prev => !prev)}
            aria-expanded={extraordinaryExpanded}
          >
            <div className="gastos__title">
              <h3>Aportaciones extraordinarias</h3>
              <span className="gastos__total">{fmt(totalExtraordinary)} €</span>
            </div>
            <span className={`gastos__toggle${extraordinaryExpanded ? ' gastos__toggle--open' : ''}`}>▼</span>
          </button>
          {extraordinaryExpanded && (
            <div className="gastos__body">
              {extraordinaryList.length === 0 && (
                <p className="gastos__empty">Sin aportaciones añadidas</p>
              )}
              {extraordinaryList.map(contrib => (
                <div key={contrib.id} className="gasto-row">
                  <input
                    type="text"
                    className="gasto-desc"
                    placeholder="Descripción"
                    value={contrib.descripcion}
                    onChange={e => updateExtraordinaryContribution(contrib.id, 'descripcion', e.target.value)}
                  />
                  <div className="input-group gasto-value">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={contrib.importe}
                      onFocus={e => e.target.select()}
                      onChange={e => updateExtraordinaryContribution(contrib.id, 'importe', Number(e.target.value))}
                    />
                    <span className="suffix">€</span>
                  </div>
                  <input
                    type="text"
                    className="gasto-fecha"
                    placeholder="MM/YYYY"
                    value={contrib.fecha}
                    onChange={e => updateExtraordinaryContribution(contrib.id, 'fecha', e.target.value)}
                  />
                  <button type="button" className="btn-remove" onClick={() => removeExtraordinaryContribution(contrib.id)}>✕</button>
                </div>
              ))}
              <button type="button" className="btn-add gastos__add" onClick={addExtraordinaryContribution}>+ Añadir aportación</button>
            </div>
          )}
        </div>

      </div>

      <div className="hipoteca__charts">
        <h3>
          Amortización a {state.termYears} años
          {hasContributions && (
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)', marginLeft: 8 }}>
              · {state.amortizationType === 'cuota' ? 'reduciendo cuota' : 'reduciendo plazo'}
            </span>
          )}
        </h3>
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
                  if (v === 'outstandingPrincipal') return 'Capital pendiente'
                  if (v === 'accumulatedPrincipalBase') return 'Capital amortizado (sin amort.)'
                  if (v === 'accumulatedPrincipal') return 'Capital amortizado'
                  if (v === 'accumulatedInterestBase') return 'Intereses pagados (sin amort.)'
                  return 'Intereses pagados'
                }}
                wrapperStyle={{ fontSize: 14, textAlign: 'center', width: '100%', left: 0 }}
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
              {hasContributions && (
                <Line
                  type="monotone"
                  dataKey="accumulatedPrincipalBase"
                  stroke="rgba(99, 200, 132, 0.4)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  legendType="line"
                />
              )}
              {hasContributions && (
                <Line
                  type="monotone"
                  dataKey="accumulatedInterestBase"
                  stroke="rgba(246, 173, 85, 0.4)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  legendType="line"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Savings summary */}
        {payoffInfo && (payoffInfo.monthsSaved > 0 || (state.amortizationType === 'cuota' && payoffInfo.interestSaved > 0)) && (
          <div className="field field--computed hipoteca__savings">
            <label>
              Con aportaciones periódicas ({state.amortizationType === 'cuota' ? 'cuota' : 'plazo'})
            </label>
            <div className="computed-value">
              {state.amortizationType === 'cuota' ? (
                <>
                  {fmt(payoffInfo.finalPayment ?? hipoteca.cuotaMensual)} €/mes <span className="detail hipoteca__last-payment-note">*última cuota</span>
                  <span className="detail hipoteca__savings-detail">
                    {fmt(Math.max(0, hipoteca.cuotaMensual - (payoffInfo.finalPayment ?? hipoteca.cuotaMensual)))} €/mes menos en cuota
                    {' · '}
                    {fmt(Math.max(0, payoffInfo.interestSaved))} € menos en intereses
                  </span>
                </>
              ) : (
                <>
                  {Math.floor(payoffInfo.enhancedMonths / 12)} años
                  {payoffInfo.enhancedMonths % 12 > 0 ? ` ${payoffInfo.enhancedMonths % 12} meses` : ''} de hipoteca
                  <span className="detail hipoteca__savings-detail">
                    {payoffInfo.monthsSaved >= 12
                      ? `${Math.floor(payoffInfo.monthsSaved / 12)} año${Math.floor(payoffInfo.monthsSaved / 12) > 1 ? 's' : ''}${payoffInfo.monthsSaved % 12 > 0 ? ` y ${payoffInfo.monthsSaved % 12} meses` : ''} antes`
                      : `${payoffInfo.monthsSaved} meses antes`}
                    {' · '}
                    {fmt(Math.max(0, payoffInfo.interestSaved))} € menos en intereses
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Amortization schedule table */}
        {detailedSchedule.length > 0 && (
          <div className="schedule-panel">
            <button
              type="button"
              className="schedule-panel__header"
              onClick={() => setScheduleExpanded(prev => !prev)}
              aria-expanded={scheduleExpanded}
            >
              <span>Simulación de cuotas</span>
              <span className="schedule-panel__header-actions">
                <div
                  className="segmented-control segmented-control--small"
                  onClick={(e) => e.stopPropagation()}
                  style={!hasContributions ? { visibility: 'hidden' } : undefined}
                >
                  <button
                    type="button"
                    className={`segmented-control__option${includeAmortizations ? ' segmented-control__option--active' : ''}`}
                    onClick={() => setIncludeAmortizations(true)}
                  >
                    Con amortizaciones
                  </button>
                  <button
                    type="button"
                    className={`segmented-control__option${!includeAmortizations ? ' segmented-control__option--active' : ''}`}
                    onClick={() => setIncludeAmortizations(false)}
                  >
                    Sin amortizaciones
                  </button>
                </div>
                <span className={`schedule-panel__toggle${scheduleExpanded ? ' schedule-panel__toggle--open' : ''}`}>▼</span>
              </span>
            </button>
            {scheduleExpanded && (
              <div className="schedule-panel__body">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Fecha</th>
                      <th>Amortización</th>
                      <th>Intereses</th>
                      <th>Capital pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows: ReactNode[] = []
                      let yearPrincipal = 0
                      let yearInterest = 0
                      for (let i = 0; i < detailedSchedule.length; i++) {
                        const row = detailedSchedule[i]
                        yearPrincipal += row.principal
                        yearInterest += row.interest
                        rows.push(
                          <tr key={row.num}>
                            <td className="schedule-table__num">{row.num}</td>
                            <td>{row.date}</td>
                            <td className="schedule-table__amount">{fmtDec(row.principal)} €</td>
                            <td className="schedule-table__interest">{fmtDec(row.interest)} €</td>
                            <td className="schedule-table__outstanding">{fmtDec(row.outstanding)} €</td>
                          </tr>
                        )
                        const isLastRow = i === detailedSchedule.length - 1
                        if (row.num % 12 === 0 || isLastRow) {
                          const yearNum = Math.ceil(row.num / 12)
                          rows.push(
                            <tr key={`year-${yearNum}`} className="schedule-table__year-summary">
                              <td className="schedule-table__year-label">Año {yearNum}</td>
                              <td />
                              <td className="schedule-table__amount">{fmtDec(yearPrincipal)} €</td>
                              <td className="schedule-table__interest">{fmtDec(yearInterest)} €</td>
                              <td className="schedule-table__outstanding">{fmtDec(row.outstanding)} €</td>
                            </tr>
                          )
                          yearPrincipal = 0
                          yearInterest = 0
                        }
                      }
                      return rows
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
