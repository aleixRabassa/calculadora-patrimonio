import { useMemo, useState } from 'react'
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { calcularSalarioNeto } from '../utils/calculations'
import './Ingresos.css'

interface SubidaSalarial {
  id: string
  mes: number // mes desde hoy (0 = ahora)
  nuevoBrutoAnual: number
}

interface IngresosState {
  brutoAnual: number
  gastosFijos: number
  ahorroInicial: number
  subidas: SubidaSalarial[]
}

const DEFAULT_STATE: IngresosState = {
  brutoAnual: 25_000,
  gastosFijos: 800,
  ahorroInicial: 5_000,
  subidas: [],
}

const MAX_HORIZONTE_MESES = 240 // 20 años
const HORIZON_OPTIONS = [1, 2, 5, 10, 20] as const

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

  const netoInfo = calcularSalarioNeto(state.brutoAnual)
  const ahorroMensual = netoInfo.netoMensual - state.gastosFijos

  const chartData = useMemo(() => {
    const horizonMeses = horizonYears * 12
    // Sort salary raises by month
    const subidasOrdenadas = [...state.subidas].sort((a, b) => a.mes - b.mes)

    const data: Array<{ mes: number; label: string; salarioNeto: number; ahorroAcumulado: number }> = []
    let ahorroAcum = state.ahorroInicial
    let brutoActual = state.brutoAnual

    for (let m = 0; m <= horizonMeses; m++) {
      // Check if there's a salary raise at this month
      const subida = subidasOrdenadas.find(s => s.mes === m)
      if (subida) {
        brutoActual = subida.nuevoBrutoAnual
      }

      const neto = calcularSalarioNeto(brutoActual)
      const ahorro = neto.netoMensual - state.gastosFijos

      if (m > 0) {
        ahorroAcum += ahorro
      }

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
  }, [state.brutoAnual, state.gastosFijos, state.ahorroInicial, state.subidas, horizonYears])

  const addSubida = () => {
    const nextMes = state.subidas.length > 0
      ? Math.max(...state.subidas.map(s => s.mes)) + 12
      : 12
    setState(prev => ({
      ...prev,
      subidas: [...prev.subidas, { id: crypto.randomUUID(), mes: nextMes, nuevoBrutoAnual: prev.brutoAnual + 2_000 }],
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

        <div className="field">
          <label htmlFor="gastosFijos">Gastos fijos mensuales</label>
          <div className="input-group">
            <input
              id="gastosFijos"
              type="number"
              min={0}
              step={50}
              value={state.gastosFijos}
              onChange={e => setState(prev => ({ ...prev, gastosFijos: Number(e.target.value) }))}
            />
            <span className="suffix">€/mes</span>
          </div>
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
          {state.subidas.map(subida => (
            <div key={subida.id} className="subida-row">
              <div className="subida-field">
                <label>Mes</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_HORIZONTE_MESES}
                  value={subida.mes}
                  onChange={e => updateSubida(subida.id, 'mes', Number(e.target.value))}
                />
              </div>
              <div className="subida-field">
                <label>Nuevo bruto anual</label>
                <div className="input-group">
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={subida.nuevoBrutoAnual}
                    onChange={e => updateSubida(subida.id, 'nuevoBrutoAnual', Number(e.target.value))}
                  />
                  <span className="suffix">€</span>
                </div>
              </div>
              <button type="button" className="btn-remove" onClick={() => removeSubida(subida.id)}>✕</button>
            </div>
          ))}
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
            <Tooltip
              formatter={(value, name) =>
                [name === 'salarioNeto' ? `${value}€/mes` : `${Number(value).toLocaleString()}€`, name === 'salarioNeto' ? 'Salario neto mensual' : 'Ahorro acumulado']
              }
              labelFormatter={m => chartData[m as number]?.label ?? ''}
            />
            <Legend formatter={v => v === 'salarioNeto' ? 'Salario neto mensual' : 'Ahorro acumulado'} />
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
