import { useMemo, useState, useEffect } from 'react'
import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { calcularSalarioNeto } from '../utils/calculations'
import './Ingresos.css'

interface SubidaSalarial {
  id: string
  mes: number // mes desde hoy (0 = ahora)
  nuevoBrutoAnual: number
}

interface GastoMensual {
  id: string
  descripcion: string
  valor: number
}

// Legacy shape used only for one-time migration
interface LegacyIngresosState {
  gastosFijos?: number
}

interface IngresosState {
  brutoAnual: number
  gastos: GastoMensual[]
  ahorroInicial: number
  subidas: SubidaSalarial[]
}

function mesesHastaEnero(): number {
  const today = new Date()
  return (12 - today.getMonth()) % 12 || 12
}

const DEFAULT_STATE: IngresosState = {
  brutoAnual: 43_000,
  gastos: [
    { id: 'gasto-hipoteca', descripcion: 'Entrada hipoteca', valor: 1_370 },
    { id: 'gasto-gastos', descripcion: 'Gastos', valor: 250 },
  ],
  ahorroInicial: 0,
  subidas: (() => {
    const base = mesesHastaEnero()
    return [
      { id: 'subida-1', mes: base, nuevoBrutoAnual: 50_000 },
      { id: 'subida-2', mes: base + 12, nuevoBrutoAnual: 55_000 },
    ]
  })(),
}

const MAX_HORIZONTE_MESES = 240 // 20 años
const HORIZON_OPTIONS = [1, 2, 5, 10, 20] as const

interface ChartPoint {
  mes: number
  label: string
  salarioNeto: number
  ahorroAcumulado: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>
  label?: number
  chartData: ChartPoint[]
}

function formatFutureMes(mesesDesdeHoy: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + mesesDesdeHoy)
  const str = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function ChartTooltip({ active, payload, label, chartData }: ChartTooltipProps) {
  if (!active || !payload?.length || label == null) return null
  const point = chartData[label]
  if (!point) return null

  const salarioValue = payload.find(p => p.dataKey === 'salarioNeto')?.value
  const ahorroValue = payload.find(p => p.dataKey === 'ahorroAcumulado')?.value

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__date">{formatFutureMes(point.mes)}</div>
      {typeof salarioValue === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'var(--accent)' }} />
          <span className="chart-tooltip__label">Salario neto</span>
          <span className="chart-tooltip__value">{salarioValue.toLocaleString('es-ES')} €/mes</span>
        </div>
      )}
      {typeof ahorroValue === 'number' && (
        <div className="chart-tooltip__row">
          <span className="chart-tooltip__dot" style={{ background: 'rgb(99, 200, 132)' }} />
          <span className="chart-tooltip__label">Ahorro acumulado</span>
          <span className="chart-tooltip__value">{ahorroValue.toLocaleString('es-ES')} €</span>
        </div>
      )}
    </div>
  )
}

function xAxisInterval(years: number): number {
  if (years <= 1) return 2   // every 3 months
  if (years <= 2) return 5   // every 6 months
  if (years <= 5) return 11  // every year
  if (years <= 10) return 23 // every 2 years
  return 47                  // every 4 years
}

export function Ingresos() {
  const [state, setState] = useLocalStorage<IngresosState>('calc.ingresos', DEFAULT_STATE)
  const [horizonYears, setHorizonYears] = useState<number>(5)
  const [fechaObjetivo, setFechaObjetivo] = useLocalStorage<string>('calc.ingresos.fechaObjetivo', '2027-11-01')
  const [ahorroObjetivo, setAhorroObjetivo] = useLocalStorage<number | null>('calc.ingresos.ahorroObjetivo', 100_000)
  const [gastosExpanded, setGastosExpanded] = useState<boolean>(false)

  // One-time migration: if old state has gastosFijos but no gastos, convert it
  useEffect(() => {
    if (!state.gastos) {
      const legacy = (state as IngresosState & LegacyIngresosState).gastosFijos ?? 800
      setState(prev => ({ ...prev, gastos: [{ id: crypto.randomUUID(), descripcion: 'Gastos fijos', valor: legacy }] }))
    }
  }, [state, setState])

  const gastosList = state.gastos ?? []
  const totalGastos = gastosList.reduce((sum, g) => sum + g.valor, 0)

  const netoInfo = calcularSalarioNeto(state.brutoAnual)
  const ahorroMensual = netoInfo.netoMensual - totalGastos

  // Full 20-year projection used for target calculations
  const fullProjection = useMemo(() => {
    const subidasOrdenadas = [...state.subidas].sort((a, b) => a.mes - b.mes)
    const data: ChartPoint[] = []
    let ahorroAcum = state.ahorroInicial
    let brutoActual = state.brutoAnual
    const gastosMensuales = (state.gastos ?? []).reduce((sum, g) => sum + g.valor, 0)

    for (let m = 0; m <= MAX_HORIZONTE_MESES; m++) {
      const subida = subidasOrdenadas.find(s => s.mes === m)
      if (subida) brutoActual = subida.nuevoBrutoAnual

      const neto = calcularSalarioNeto(brutoActual)
      const ahorro = neto.netoMensual - gastosMensuales
      if (m > 0) ahorroAcum += ahorro

      const year = Math.floor(m / 12)
      const month = m % 12
      data.push({
        mes: m,
        label: `${year}a ${month}m`,
        salarioNeto: Math.round(neto.netoMensual),
        ahorroAcumulado: Math.round(ahorroAcum),
      })
    }
    return data
  }, [state.brutoAnual, state.gastos, state.ahorroInicial, state.subidas])

  const chartData = useMemo(
    () => fullProjection.slice(0, horizonYears * 12 + 1),
    [fullProjection, horizonYears],
  )

  const dateTargetResult = useMemo(() => {
    if (!fechaObjetivo) return null
    const today = new Date()
    const parts = fechaObjetivo.split('-').map(Number)
    const months = (parts[0] - today.getFullYear()) * 12 + (parts[1] - 1 - today.getMonth())
    if (months < 0) return { type: 'past' as const }
    if (months > MAX_HORIZONTE_MESES) return { type: 'far' as const }
    const dataPoint = fullProjection[months]
    return {
      type: 'found' as const,
      months,
      savings: dataPoint.ahorroAcumulado,
      inChartRange: months <= horizonYears * 12,
    }
  }, [fechaObjetivo, fullProjection, horizonYears])

  const savingsTargetResult = useMemo(() => {
    if (!ahorroObjetivo || ahorroObjetivo <= 0) return null
    if (fullProjection[0].ahorroAcumulado >= ahorroObjetivo) return { type: 'already' as const }
    const idx = fullProjection.findIndex(d => d.ahorroAcumulado >= ahorroObjetivo)
    if (idx === -1) return { type: 'unreachable' as const }
    const today = new Date()
    const resultDate = new Date(today.getFullYear(), today.getMonth() + idx, 1)
    const rawLabel = resultDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const dateLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)
    return {
      type: 'found' as const,
      mes: idx,
      dateLabel,
      savings: fullProjection[idx].ahorroAcumulado,
      inChartRange: idx <= horizonYears * 12,
    }
  }, [ahorroObjetivo, fullProjection, horizonYears])

  const addGasto = () => {
    setState(prev => ({
      ...prev,
      gastos: [...(prev.gastos ?? []), { id: crypto.randomUUID(), descripcion: '', valor: 0 }],
    }))
  }

  const removeGasto = (id: string) => {
    setState(prev => ({ ...prev, gastos: (prev.gastos ?? []).filter(g => g.id !== id) }))
  }

  const updateGasto = (id: string, field: 'descripcion' | 'valor', value: string | number) => {
    setState(prev => ({
      ...prev,
      gastos: (prev.gastos ?? []).map(g => g.id === id ? { ...g, [field]: value } : g),
    }))
  }

  const subidaHints = useMemo(() => {
    const sorted = [...state.subidas].sort((a, b) => a.mes - b.mes)
    const today = new Date()
    return Object.fromEntries(
      sorted.map((subida, idx) => {
        const prevBruto = idx === 0 ? state.brutoAnual : sorted[idx - 1].nuevoBrutoAnual
        const pctChange = prevBruto > 0 ? ((subida.nuevoBrutoAnual - prevBruto) / prevBruto) * 100 : 0
        const targetDate = new Date(today.getFullYear(), today.getMonth() + subida.mes, 1)
        const rawLabel = targetDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
        const withoutDe = rawLabel.replace(' de ', ' ')
        const dateLabel = withoutDe.charAt(0).toUpperCase() + withoutDe.slice(1)
        return [subida.id, { dateLabel, pctChange }]
      }),
    )
  }, [state.subidas, state.brutoAnual])

  const addSubida = () => {
    const sortedSubidas = [...state.subidas].sort((a, b) => a.mes - b.mes)
    const lastSubida = sortedSubidas[sortedSubidas.length - 1] ?? null
    const nextMes = lastSubida != null ? lastSubida.mes + 12 : mesesHastaEnero()
    const nextBruto = lastSubida != null ? lastSubida.nuevoBrutoAnual + 5_000 : state.brutoAnual + 5_000
    setState(prev => ({
      ...prev,
      subidas: [...prev.subidas, { id: crypto.randomUUID(), mes: nextMes, nuevoBrutoAnual: nextBruto }],
    }))
  }

  const removeSubida = (id: string) => {
    setState(prev => ({
      ...prev,
      subidas: prev.subidas.filter(s => s.id !== id),
    }))
  }

  const updateSubida = (id: string, field: 'mes' | 'nuevoBrutoAnual', value: number) => {
    setState(prev => ({
      ...prev,
      subidas: prev.subidas.map(s => s.id === id ? { ...s, [field]: value } : s),
    }))
  }

  return (
    <section className="ingresos">
      <div className="ingresos__form">
        <h2>Ingresos y Ahorro</h2>

        <div className="field">
          <label htmlFor="brutoAnual">Salario bruto anual</label>
          <div className="input-group">
            <input
              id="brutoAnual"
              type="number"
              min={0}
              step={500}
              value={state.brutoAnual}
              onChange={e => setState(prev => ({ ...prev, brutoAnual: Number(e.target.value) }))}
            />
            <span className="suffix">€/año</span>
          </div>
        </div>

        <div className="field field--computed">
          <label>Salario neto mensual</label>
          <div className="computed-value">
            {netoInfo.netoMensual.toFixed(0)} €/mes
            <span className="detail">IRPF efectivo: {netoInfo.tipoEfectivoIRPF.toFixed(1)}%</span>
          </div>
        </div>

        <div className="gastos">
          <button
            type="button"
            className="gastos__header"
            onClick={() => setGastosExpanded(prev => !prev)}
            aria-expanded={gastosExpanded}
          >
            <div className="gastos__title">
              <h3>Gastos mensuales</h3>
              <span className="gastos__total">{totalGastos.toFixed(0)} €/mes</span>
            </div>
            <span className={`gastos__toggle${gastosExpanded ? ' gastos__toggle--open' : ''}`}>▼</span>
          </button>
          {gastosExpanded && (
            <div className="gastos__body">
              {gastosList.length === 0 && (
                <p className="gastos__empty">Sin gastos añadidos</p>
              )}
              {gastosList.map(gasto => (
                <div key={gasto.id} className="gasto-row">
                  <input
                    type="text"
                    className="gasto-desc"
                    placeholder="Descripción"
                    value={gasto.descripcion}
                    onChange={e => updateGasto(gasto.id, 'descripcion', e.target.value)}
                  />
                  <div className="input-group gasto-value">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={gasto.valor}
                      onChange={e => updateGasto(gasto.id, 'valor', Number(e.target.value))}
                    />
                    <span className="suffix">€/mes</span>
                  </div>
                  <button type="button" className="btn-remove" onClick={() => removeGasto(gasto.id)}>✕</button>
                </div>
              ))}
              <button type="button" className="btn-add gastos__add" onClick={addGasto}>+ Añadir gasto</button>
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="ahorroInicial">Ahorro inicial</label>
          <div className="input-group">
            <input
              id="ahorroInicial"
              type="number"
              min={0}
              step={500}
              value={state.ahorroInicial}
              onChange={e => setState(prev => ({ ...prev, ahorroInicial: Number(e.target.value) }))}
            />
            <span className="suffix">€</span>
          </div>
        </div>

        <div className="field field--computed">
          <label>Ahorro mensual</label>
          <div className={`computed-value ${ahorroMensual < 0 ? 'computed-value--negative' : ''}`}>
            {ahorroMensual.toFixed(0)} €/mes
          </div>
        </div>

        <div className="subidas">
          <div className="subidas__header">
            <h3>Subidas salariales</h3>
            <button type="button" className="btn-add" onClick={addSubida}>+ Añadir</button>
          </div>
          {state.subidas.length === 0 && (
            <p className="subidas__empty">Sin subidas planificadas</p>
          )}
          {state.subidas.map(subida => {
            const hints = subidaHints[subida.id]
            return (
              <div key={subida.id} className="subida-row">
                <div className="subida-field">
                  <label>Mes</label>
                  <div className="subida-input-overlay subida-input-overlay--date">
                    <input
                      type="number"
                      min={1}
                      max={MAX_HORIZONTE_MESES}
                      value={subida.mes}
                      onChange={e => updateSubida(subida.id, 'mes', Number(e.target.value))}
                    />
                    {hints && <span className="subida-hint subida-hint--date">{hints.dateLabel}</span>}
                  </div>
                </div>
                <div className="subida-field">
                  <label>Nuevo bruto anual</label>
                  <div className="input-group">
                    <div className="subida-input-overlay subida-input-overlay--salary">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={subida.nuevoBrutoAnual}
                        onChange={e => updateSubida(subida.id, 'nuevoBrutoAnual', Number(e.target.value))}
                      />
                      {hints && (
                        <span className={`subida-hint ${hints.pctChange >= 0 ? 'subida-hint--pos' : 'subida-hint--neg'}`}>
                          {hints.pctChange >= 0 ? '+' : ''}{hints.pctChange.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <span className="suffix">€</span>
                  </div>
                </div>
                <button type="button" className="btn-remove" onClick={() => removeSubida(subida.id)}>✕</button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="ingresos__charts">
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
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <XAxis
              dataKey="mes"
              tickFormatter={m => `${Math.floor(m / 12)}a`}
              interval={xAxisInterval(horizonYears)}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              yAxisId="salary"
              orientation="left"
              tickFormatter={v => `${v}€`}
              tick={{ fontSize: 12 }}
              width={70}
            />
            <YAxis
              yAxisId="savings"
              orientation="right"
              tickFormatter={v => `${(v / 1000).toFixed(0)}k€`}
              tick={{ fontSize: 12 }}
              width={55}
            />
            <Tooltip content={(props) => <ChartTooltip {...(props as unknown as ChartTooltipProps)} chartData={chartData} />} />
            <Legend formatter={v => v === 'salarioNeto' ? 'Salario neto mensual' : 'Ahorro acumulado'} wrapperStyle={{ fontSize: 14, textAlign: 'center' }} />
            <Line
              yAxisId="salary"
              type="stepAfter"
              dataKey="salarioNeto"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              yAxisId="savings"
              type="monotone"
              dataKey="ahorroAcumulado"
              fill="rgba(99, 200, 132, 0.15)"
              stroke="rgb(99, 200, 132)"
              strokeWidth={2}
            />
            {dateTargetResult?.type === 'found' && dateTargetResult.inChartRange && (
              <ReferenceLine
                x={dateTargetResult.months}
                stroke="#f6ad55"
                strokeDasharray="4 4"
                strokeOpacity={0.8}
              />
            )}
            {dateTargetResult?.type === 'found' && dateTargetResult.inChartRange && (
              <ReferenceDot
                yAxisId="savings"
                x={dateTargetResult.months}
                y={dateTargetResult.savings}
                r={6}
                fill="#f6ad55"
                stroke="white"
                strokeWidth={2}
              />
            )}
            {savingsTargetResult?.type === 'found' && savingsTargetResult.inChartRange && (
              <ReferenceLine
                x={savingsTargetResult.mes}
                stroke="#4ecdc4"
                strokeDasharray="4 4"
                strokeOpacity={0.8}
              />
            )}
            {savingsTargetResult?.type === 'found' && savingsTargetResult.inChartRange && (
              <ReferenceDot
                yAxisId="savings"
                x={savingsTargetResult.mes}
                y={savingsTargetResult.savings}
                r={6}
                fill="#4ecdc4"
                stroke="white"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="goals">
          <div className="goal-item">
            <label className="goal-label" htmlFor="fechaObjetivo">
              <span className="goal-dot goal-dot--date" />
              Fecha objetivo
            </label>
            <input
              id="fechaObjetivo"
              type="date"
              value={fechaObjetivo}
              onChange={e => setFechaObjetivo(e.target.value)}
            />
            {dateTargetResult && (
              <div className={`goal-result${dateTargetResult.type === 'found' ? ' goal-result--date' : ' goal-result--warn'}`}>
                {dateTargetResult.type === 'found' && (
                  <>
                    <span className="goal-result__amount">{dateTargetResult.savings.toLocaleString('es-ES')} €</span>
                    <span className="goal-result__label">ahorrados en esa fecha</span>
                    {!dateTargetResult.inChartRange && (
                      <span className="goal-result__note">Amplía el horizonte para ver el punto</span>
                    )}
                  </>
                )}
                {dateTargetResult.type === 'past' && <span>La fecha está en el pasado</span>}
                {dateTargetResult.type === 'far' && <span>Fecha a más de 20 años vista</span>}
              </div>
            )}
          </div>

          <div className="goal-item">
            <label className="goal-label" htmlFor="ahorroObjetivo">
              <span className="goal-dot goal-dot--savings" />
              Ahorro objetivo
            </label>
            <div className="input-group">
              <input
                id="ahorroObjetivo"
                type="number"
                min={0}
                step={1000}
                value={ahorroObjetivo ?? ''}
                placeholder="0"
                onChange={e => setAhorroObjetivo(e.target.value === '' ? null : Number(e.target.value))}
              />
              <span className="suffix">€</span>
            </div>
            {savingsTargetResult && (
              <div className={`goal-result${savingsTargetResult.type === 'found' ? ' goal-result--savings' : ' goal-result--warn'}`}>
                {savingsTargetResult.type === 'found' && (
                  <>
                    <span className="goal-result__amount">{savingsTargetResult.dateLabel}</span>
                    <span className="goal-result__label">con {savingsTargetResult.savings.toLocaleString('es-ES')}€ ahorrados</span>
                    {!savingsTargetResult.inChartRange && (
                      <span className="goal-result__note">Amplía el horizonte para ver el punto</span>
                    )}
                  </>
                )}
                {savingsTargetResult.type === 'already' && <span>¡Ya has alcanzado este objetivo!</span>}
                {savingsTargetResult.type === 'unreachable' && <span>No alcanzable en 20 años con el ahorro actual</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
