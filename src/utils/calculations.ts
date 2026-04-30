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
