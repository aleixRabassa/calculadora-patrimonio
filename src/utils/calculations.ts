// --- Salario Neto ---

export type Country = 'spain' | 'andorra'

// Spain
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

function calcularTramos(baseImponible: number, brackets: Array<{ limit: number; rate: number }>): number {
  let cuota = 0
  let prev = 0
  for (const { limit, rate } of brackets) {
    if (baseImponible <= prev) break
    const tramo = Math.min(baseImponible, limit) - prev
    cuota += tramo * rate
    prev = limit
  }
  return cuota
}

// Andorra
const ANDORRA_CASS_RATE = 0.065 // Branca general: cotització empleat
const ANDORRA_CASS_MAX_BASE = 50_400 // Base màxima aprox. 2024

const ANDORRA_IRPF_BRACKETS: Array<{ limit: number; rate: number }> = [
  { limit: 24_000, rate: 0.00 },
  { limit: 40_000, rate: 0.05 },
  { limit: Infinity, rate: 0.10 },
]

export interface ResultadoSalarioNeto {
  seguridadSocial: number
  irpf: number
  netoAnual: number
  netoMensual: number
  tipoEfectivoIRPF: number
}

/**
 * Calcula el salario neto mensual para un trabajador estándar (soltero, sin hijos, 12 pagas).
 * España: aplica SS + IRPF estatal 2024.
 * Andorra: aplica CASS + IRPF andorrano 2024.
 *
 * @param brutoAnual - Salario bruto anual (€)
 * @param country - País fiscal ('spain' | 'andorra'), por defecto 'spain'
 */
export function calcularSalarioNeto(brutoAnual: number, country: Country = 'spain'): ResultadoSalarioNeto {
  if (!isFinite(brutoAnual) || brutoAnual <= 0) {
    return { seguridadSocial: 0, irpf: 0, netoAnual: 0, netoMensual: 0, tipoEfectivoIRPF: 0 }
  }

  if (country === 'andorra') {
    const baseCass = Math.min(brutoAnual, ANDORRA_CASS_MAX_BASE)
    const seguridadSocial = baseCass * ANDORRA_CASS_RATE
    const baseImponible = brutoAnual - seguridadSocial
    const irpf = calcularTramos(baseImponible, ANDORRA_IRPF_BRACKETS)
    const netoAnual = brutoAnual - seguridadSocial - irpf
    const netoMensual = netoAnual / 12
    const tipoEfectivoIRPF = (irpf / brutoAnual) * 100
    return { seguridadSocial, irpf, netoAnual, netoMensual, tipoEfectivoIRPF }
  }

  // Spain
  const baseCotizacion = Math.min(brutoAnual, SS_MAX_BASE_ANUAL)
  const seguridadSocial = baseCotizacion * SS_EMPLOYEE_RATE

  const rendimientoNeto = brutoAnual - seguridadSocial - GASTOS_DEDUCIBLES

  let reduccion = 0
  if (rendimientoNeto <= 14_852) {
    reduccion = 7_302
  } else if (rendimientoNeto <= 17_673.52) {
    reduccion = 7_302 - 2.00 * (rendimientoNeto - 14_852)
  }

  const baseLiquidable = Math.max(0, rendimientoNeto - reduccion)
  const cuotaIntegra = calcularTramos(baseLiquidable, IRPF_BRACKETS)
  const cuotaMinimo = calcularTramos(Math.min(MINIMO_PERSONAL, baseLiquidable), IRPF_BRACKETS)
  const irpf = Math.max(0, cuotaIntegra - cuotaMinimo)

  const netoAnual = brutoAnual - seguridadSocial - irpf
  const netoMensual = netoAnual / 12
  const tipoEfectivoIRPF = (irpf / brutoAnual) * 100

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

// --- Amortization Schedule ---

export interface AmortizationPoint {
  month: number
  outstandingPrincipal: number
  accumulatedPrincipal: number
  accumulatedInterest: number
}

/**
 * Generates a monthly amortization schedule (French system).
 *
 * @param capital - Loan principal (€)
 * @param interestTIN - Annual nominal interest rate as percentage (e.g. 3 for 3%)
 * @param termYears - Loan term in years
 */
export function generateAmortizationSchedule(
  capital: number,
  interestTIN: number,
  termYears: number,
): AmortizationPoint[] {
  if (
    !isFinite(capital) || capital <= 0 ||
    !isFinite(interestTIN) || interestTIN < 0 ||
    !isFinite(termYears) || termYears <= 0
  ) {
    return []
  }

  const n = termYears * 12
  const r = interestTIN / 100 / 12

  const monthlyPayment = r === 0
    ? capital / n
    : (capital * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)

  const schedule: AmortizationPoint[] = []
  let outstanding = capital
  let accPrincipal = 0
  let accInterest = 0

  schedule.push({ month: 0, outstandingPrincipal: capital, accumulatedPrincipal: 0, accumulatedInterest: 0 })

  for (let m = 1; m <= n; m++) {
    const interestPart = outstanding * r
    const principalPart = monthlyPayment - interestPart
    outstanding -= principalPart
    accPrincipal += principalPart
    accInterest += interestPart

    schedule.push({
      month: m,
      outstandingPrincipal: Math.max(0, outstanding),
      accumulatedPrincipal: accPrincipal,
      accumulatedInterest: accInterest,
    })
  }

  return schedule
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

/**
 * Calcula el ahorro inicial efectivo tras descontar gastos extraordinarios (pagos únicos).
 *
 * @param ahorroInicial - Ahorro inicial disponible (€)
 * @param totalGastosExtraordinarios - Suma de todos los gastos extraordinarios (€)
 */
export function calcularAhorroInicialEfectivo(ahorroInicial: number, totalGastosExtraordinarios: number): number {
  return ahorroInicial - totalGastosExtraordinarios
}
