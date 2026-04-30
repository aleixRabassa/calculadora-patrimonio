// --- Salario Neto (España, joven trabajador estándar, sin hijos, 12 pagas) ---

const SS_EMPLOYEE_RATE = 0.0647 // Contingencias comunes 4.70% + Desempleo 1.55% + FP 0.10% + MEI 0.12%
const SS_MAX_BASE_ANUAL = 56_646 // Base máxima cotización 2024 (~4720.50€/mes × 12)
const GASTOS_DEDUCIBLES = 2_000

const IRPF_BRACKETS: Array<{ limit: number; rate: number }> = [
  { limit: 12_450, rate: 0.19 },
  { limit: 20_200, rate: 0.24 },
  { limit: 35_200, rate: 0.30 },
  { limit: 60_000, rate: 0.37 },
  { limit: 300_000, rate: 0.45 },
  { limit: Infinity, rate: 0.47 },
]

const MINIMO_PERSONAL = 5_550

function calcularCuotaIRPF(baseImponible: number): number {
  let cuota = 0
  let prev = 0
  for (const { limit, rate } of IRPF_BRACKETS) {
    if (baseImponible <= prev) break
    const tramo = Math.min(baseImponible, limit) - prev
    cuota += tramo * rate
    prev = limit
  }
  return cuota
}

export interface ResultadoSalarioNeto {
  seguridadSocial: number
  irpf: number
  netoAnual: number
  netoMensual: number
  tipoEfectivoIRPF: number
}

/**
 * Calcula el salario neto mensual para un joven trabajador estándar en España.
 * Asume: soltero, sin hijos, sin discapacidad, 12 pagas, contrato indefinido.
 *
 * @param brutoAnual - Salario bruto anual (€)
 */
export function calcularSalarioNeto(brutoAnual: number): ResultadoSalarioNeto {
  if (!isFinite(brutoAnual) || brutoAnual <= 0) {
    return { seguridadSocial: 0, irpf: 0, netoAnual: 0, netoMensual: 0, tipoEfectivoIRPF: 0 }
  }

  // 1. Seguridad Social empleado
  const baseCotizacion = Math.min(brutoAnual, SS_MAX_BASE_ANUAL)
  const seguridadSocial = baseCotizacion * SS_EMPLOYEE_RATE

  // 2. Rendimiento neto del trabajo
  const rendimientoNeto = brutoAnual - seguridadSocial - GASTOS_DEDUCIBLES

  // 3. Reducción por rendimientos del trabajo (2024)
  let reduccion = 0
  if (rendimientoNeto <= 14_852) {
    reduccion = 7_302
  } else if (rendimientoNeto <= 17_673.52) {
    reduccion = 7_302 - 2.00 * (rendimientoNeto - 14_852)
  }

  // 4. Base liquidable general
  const baseLiquidable = Math.max(0, rendimientoNeto - reduccion)

  // 5. Cuota íntegra – cuota del mínimo personal
  const cuotaIntegra = calcularCuotaIRPF(baseLiquidable)
  const cuotaMinimo = calcularCuotaIRPF(Math.min(MINIMO_PERSONAL, baseLiquidable))
  const irpf = Math.max(0, cuotaIntegra - cuotaMinimo)

  // 6. Neto
  const netoAnual = brutoAnual - seguridadSocial - irpf
  const netoMensual = netoAnual / 12
  const tipoEfectivoIRPF = brutoAnual > 0 ? (irpf / brutoAnual) * 100 : 0

  return { seguridadSocial, irpf, netoAnual, netoMensual, tipoEfectivoIRPF }
}

// --- Hipoteca ---

export interface ResultadoHipoteca {
  capital: number
  cuotaMensual: number
  totalPagado: number
  interesesTotales: number
}

export interface ResultadoInversion {
  valorFinal: number
  capitalInvertido: number
  interesesGenerados: number
}

/**
 * Calcula la hipoteca con el sistema de amortización francés.
 *
 * @param precio - Precio total del inmueble (€)
 * @param entrada - Pago inicial (€)
 * @param interesTIN - Tipo de Interés Nominal anual como porcentaje (e.g. 3.5 para 3.5%)
 * @param plazoAnios - Plazo en años
 */
export function calcularHipoteca(
  precio: number,
  entrada: number,
  interesTIN: number,
  plazoAnios: number,
): ResultadoHipoteca {
  const capital = precio - entrada

  if (
    !isFinite(capital) || capital <= 0 ||
    !isFinite(interesTIN) || interesTIN < 0 ||
    !isFinite(plazoAnios) || plazoAnios <= 0
  ) {
    return { capital: Math.max(0, isFinite(capital) ? capital : 0), cuotaMensual: 0, totalPagado: 0, interesesTotales: 0 }
  }

  const n = plazoAnios * 12
  const r = interesTIN / 100 / 12

  const cuotaMensual = r === 0
    ? capital / n
    : (capital * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)

  const totalPagado = cuotaMensual * n
  const interesesTotales = totalPagado - capital

  return { capital, cuotaMensual, totalPagado, interesesTotales }
}

/**
 * Calcula el valor futuro de una inversión con aportaciones mensuales al final de cada período.
 *
 * @param capitalInicial - Capital inicial invertido (€)
 * @param aportacionMensual - Aportación mensual (€)
 * @param interesTIN - Tipo de Interés Nominal anual como porcentaje (e.g. 7 para 7%)
 * @param plazoAnios - Horizonte de inversión en años
 */
export function calcularInversion(
  capitalInicial: number,
  aportacionMensual: number,
  interesTIN: number,
  plazoAnios: number,
): ResultadoInversion {
  if (
    !isFinite(capitalInicial) || capitalInicial < 0 ||
    !isFinite(aportacionMensual) || aportacionMensual < 0 ||
    !isFinite(interesTIN) || interesTIN < 0 ||
    !isFinite(plazoAnios) || plazoAnios < 0
  ) {
    return { valorFinal: 0, capitalInvertido: 0, interesesGenerados: 0 }
  }

  if (plazoAnios === 0) {
    return { valorFinal: capitalInicial, capitalInvertido: capitalInicial, interesesGenerados: 0 }
  }

  const n = plazoAnios * 12
  const r = interesTIN / 100 / 12

  const valorFinal = r === 0
    ? capitalInicial + aportacionMensual * n
    : capitalInicial * Math.pow(1 + r, n) +
      aportacionMensual * ((Math.pow(1 + r, n) - 1) / r)

  const capitalInvertido = capitalInicial + aportacionMensual * n
  const interesesGenerados = valorFinal - capitalInvertido

  return { valorFinal, capitalInvertido, interesesGenerados }
}

/**
 * Calcula el patrimonio neto.
 *
 * @param activos - Valor total de los activos (€)
 * @param pasivos - Valor total de los pasivos / deudas (€)
 */
export function calcularPatrimonioNeto(activos: number, pasivos: number): number {
  return activos - pasivos
}
