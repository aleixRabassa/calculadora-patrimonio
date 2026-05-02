import { describe, test, expect } from 'vitest'
import { calcularAhorroInicialEfectivo, calcularHipoteca, calcularInversion, calcularPatrimonioNeto, calcularSalarioNeto, generateAmortizationSchedule, generateAmortizationScheduleWithContributions, generateInvestmentSchedule } from './calculations'

describe('calcularSalarioNeto - Andorra', () => {
  test('retorna ceros para bruto inválido', () => {
    const r = calcularSalarioNeto(0, 'andorra')
    expect(r.netoMensual).toBe(0)
    expect(r.irpf).toBe(0)
    expect(r.seguridadSocial).toBe(0)
  })

  test('salario bajo (20k) no paga IRPF, solo CASS', () => {
    const r = calcularSalarioNeto(20_000, 'andorra')
    // Base imposable = 20000 - 20000*0.065 = 18700 → < 24k → IRPF = 0
    expect(r.irpf).toBe(0)
    expect(r.seguridadSocial).toBeCloseTo(20_000 * 0.065, 2)
    expect(r.netoMensual).toBeCloseTo((20_000 - 20_000 * 0.065) / 12, 2)
  })

  test('salario medio (30k) paga 5% solo sobre la parte que supera 24k', () => {
    const r = calcularSalarioNeto(30_000, 'andorra')
    const cass = 30_000 * 0.065
    const base = 30_000 - cass
    // base ≈ 28050 → 5% on (28050 - 24000) = 202.5
    const expectedIrpf = (base - 24_000) * 0.05
    expect(r.seguridadSocial).toBeCloseTo(cass, 2)
    expect(r.irpf).toBeCloseTo(expectedIrpf, 2)
    expect(r.netoAnual).toBeCloseTo(30_000 - cass - expectedIrpf, 2)
  })

  test('salario alto (60k) aplica 10% sobre la parte que supera 40k', () => {
    const r = calcularSalarioNeto(60_000, 'andorra')
    const cass = Math.min(60_000, 50_400) * 0.065
    const base = 60_000 - cass
    const expectedIrpf = (40_000 - 24_000) * 0.05 + (base - 40_000) * 0.10
    expect(r.irpf).toBeCloseTo(expectedIrpf, 1)
    expect(r.netoAnual).toBeCloseTo(60_000 - cass - expectedIrpf, 1)
  })

  test('netoAnual = bruto - CASS - IRPF', () => {
    const r = calcularSalarioNeto(40_000, 'andorra')
    expect(r.netoAnual).toBeCloseTo(40_000 - r.seguridadSocial - r.irpf, 2)
  })

  test('netoMensual = netoAnual / 12', () => {
    const r = calcularSalarioNeto(50_000, 'andorra')
    expect(r.netoMensual).toBeCloseTo(r.netoAnual / 12, 2)
  })

  test('CASS está limitada por la base máxima', () => {
    const r80k = calcularSalarioNeto(80_000, 'andorra')
    const r100k = calcularSalarioNeto(100_000, 'andorra')
    expect(r80k.seguridadSocial).toBeCloseTo(r100k.seguridadSocial, 2)
  })

  test('neto Andorra es mayor que neto España para el mismo salario (40k)', () => {
    const spain = calcularSalarioNeto(40_000, 'spain')
    const andorra = calcularSalarioNeto(40_000, 'andorra')
    expect(andorra.netoMensual).toBeGreaterThan(spain.netoMensual)
  })
})

describe('calcularSalarioNeto', () => {
  test('retorna ceros para bruto inválido', () => {
    const r = calcularSalarioNeto(0)
    expect(r.netoMensual).toBe(0)
    expect(r.irpf).toBe(0)
  })

  test('retorna ceros para bruto negativo', () => {
    const r = calcularSalarioNeto(-10_000)
    expect(r.netoMensual).toBe(0)
  })

  test('retorna ceros para NaN', () => {
    const r = calcularSalarioNeto(NaN)
    expect(r.netoMensual).toBe(0)
    expect(r.irpf).toBe(0)
    expect(r.seguridadSocial).toBe(0)
  })

  test('retorna ceros para Infinity', () => {
    const r = calcularSalarioNeto(Infinity)
    expect(r.netoMensual).toBe(0)
    expect(r.irpf).toBe(0)
  })

  test('salario muy bajo (~12k) tiene IRPF cero por reducción y mínimo personal', () => {
    const r = calcularSalarioNeto(12_000)
    expect(r.irpf).toBe(0)
    expect(r.netoMensual).toBeGreaterThan(0)
    expect(r.tipoEfectivoIRPF).toBe(0)
  })

  test('salario bajo (~20k) tiene retención IRPF baja', () => {
    const r = calcularSalarioNeto(20_000)
    expect(r.netoMensual).toBeGreaterThan(0)
    expect(r.netoMensual).toBeLessThan(20_000 / 12)
    expect(r.tipoEfectivoIRPF).toBeLessThan(15)
    expect(r.seguridadSocial).toBeCloseTo(20_000 * 0.0647, 0)
  })

  test('salario medio (~30k) neto mensual aproximadamente correcto', () => {
    const r = calcularSalarioNeto(30_000)
    // Neto mensual para 30k bruto debería estar entre ~1800-2000€
    expect(r.netoMensual).toBeGreaterThan(1_750)
    expect(r.netoMensual).toBeLessThan(2_100)
    expect(r.tipoEfectivoIRPF).toBeGreaterThan(8)
    expect(r.tipoEfectivoIRPF).toBeLessThan(18)
  })

  test('salario alto (~60k) tiene retención mayor', () => {
    const r = calcularSalarioNeto(60_000)
    expect(r.tipoEfectivoIRPF).toBeGreaterThan(15)
    expect(r.netoMensual).toBeGreaterThan(3_000)
    expect(r.netoMensual).toBeLessThan(4_000)
  })

  test('seguridad social está limitada por la base máxima de cotización', () => {
    const r80k = calcularSalarioNeto(80_000)
    const r100k = calcularSalarioNeto(100_000)
    // SS should be the same since both exceed the cap
    expect(r80k.seguridadSocial).toBeCloseTo(r100k.seguridadSocial, 2)
  })

  test('netoAnual = bruto - SS - IRPF', () => {
    const r = calcularSalarioNeto(40_000)
    expect(r.netoAnual).toBeCloseTo(40_000 - r.seguridadSocial - r.irpf, 2)
  })

  test('netoMensual = netoAnual / 12', () => {
    const r = calcularSalarioNeto(35_000)
    expect(r.netoMensual).toBeCloseTo(r.netoAnual / 12, 2)
  })
})

describe('calcularHipoteca', () => {
  test('calcula cuota mensual con interés positivo (caso estándar)', () => {
    // 160k capital, 3% TIN, 30 años → ~€674.58/mes
    const r = calcularHipoteca(200_000, 40_000, 3, 30)
    expect(r.capital).toBe(160_000)
    expect(r.cuotaMensual).toBeCloseTo(674.58, 0)
    expect(r.totalPagado).toBeCloseTo(r.cuotaMensual * 360, 2)
    expect(r.interesesTotales).toBeCloseTo(r.totalPagado - 160_000, 2)
    expect(r.interesesTotales).toBeGreaterThan(0)
  })

  test('cuota mensual sin interés (TIN = 0)', () => {
    const r = calcularHipoteca(120_000, 0, 0, 10)
    expect(r.cuotaMensual).toBeCloseTo(1_000, 5) // 120000 / 120 = 1000
    expect(r.totalPagado).toBeCloseTo(120_000, 2)
    expect(r.interesesTotales).toBeCloseTo(0, 5)
  })

  test('sin entrada (entrada = 0)', () => {
    const r = calcularHipoteca(200_000, 0, 3, 30)
    expect(r.capital).toBe(200_000)
    expect(r.cuotaMensual).toBeGreaterThan(0)
    expect(r.interesesTotales).toBeGreaterThan(0)
  })

  test('plazo mínimo (1 año)', () => {
    const r = calcularHipoteca(12_000, 0, 0, 1)
    expect(r.cuotaMensual).toBeCloseTo(1_000, 5)
    expect(r.totalPagado).toBeCloseTo(12_000, 2)
  })

  test('retorna ceros si la entrada supera el precio', () => {
    const r = calcularHipoteca(100_000, 120_000, 3, 25)
    expect(r.cuotaMensual).toBe(0)
    expect(r.totalPagado).toBe(0)
    expect(r.interesesTotales).toBe(0)
  })

  test('retorna ceros si la entrada es igual al precio (capital = 0)', () => {
    const r = calcularHipoteca(100_000, 100_000, 3, 25)
    expect(r.capital).toBe(0)
    expect(r.cuotaMensual).toBe(0)
    expect(r.totalPagado).toBe(0)
  })

  test('retorna ceros para tipo de interés negativo', () => {
    const r = calcularHipoteca(200_000, 40_000, -1, 30)
    expect(r.cuotaMensual).toBe(0)
    expect(r.totalPagado).toBe(0)
  })

  test('retorna ceros si el plazo es cero', () => {
    const r = calcularHipoteca(200_000, 50_000, 3, 0)
    expect(r.cuotaMensual).toBe(0)
    expect(r.totalPagado).toBe(0)
  })

  test('retorna ceros si el plazo es negativo', () => {
    const r = calcularHipoteca(200_000, 50_000, 3, -5)
    expect(r.cuotaMensual).toBe(0)
  })

  test('intereses crecen con un tipo de interés mayor', () => {
    const bajo = calcularHipoteca(200_000, 40_000, 1, 30)
    const alto = calcularHipoteca(200_000, 40_000, 5, 30)
    expect(alto.cuotaMensual).toBeGreaterThan(bajo.cuotaMensual)
    expect(alto.interesesTotales).toBeGreaterThan(bajo.interesesTotales)
  })
})

describe('calcularInversion', () => {
  test('calcula valor futuro con interés positivo (caso estándar)', () => {
    const r = calcularInversion(10_000, 200, 7, 20)
    const capitalInvertido = 10_000 + 200 * 240
    expect(r.capitalInvertido).toBe(capitalInvertido)
    expect(r.valorFinal).toBeGreaterThan(capitalInvertido)
    expect(r.interesesGenerados).toBeCloseTo(r.valorFinal - capitalInvertido, 2)
    expect(r.interesesGenerados).toBeGreaterThan(0)
  })

  test('sin interés (TIN = 0)', () => {
    const r = calcularInversion(5_000, 100, 0, 10)
    expect(r.valorFinal).toBeCloseTo(5_000 + 100 * 120, 2)
    expect(r.interesesGenerados).toBeCloseTo(0, 5)
  })

  test('sin capital inicial, solo aportaciones mensuales', () => {
    const r = calcularInversion(0, 300, 5, 10)
    expect(r.capitalInvertido).toBe(300 * 120)
    expect(r.valorFinal).toBeGreaterThan(r.capitalInvertido)
  })

  test('con capital inicial y sin aportaciones mensuales', () => {
    const r = calcularInversion(10_000, 0, 6, 10)
    expect(r.capitalInvertido).toBe(10_000)
    expect(r.valorFinal).toBeGreaterThan(10_000)
  })

  test('plazo cero retorna el capital inicial sin intereses', () => {
    const r = calcularInversion(5_000, 200, 7, 0)
    expect(r.valorFinal).toBe(5_000)
    expect(r.capitalInvertido).toBe(5_000)
    expect(r.interesesGenerados).toBe(0)
  })

  test('valor futuro crece con mayor tipo de interés', () => {
    const bajo = calcularInversion(10_000, 200, 3, 20)
    const alto = calcularInversion(10_000, 200, 8, 20)
    expect(alto.valorFinal).toBeGreaterThan(bajo.valorFinal)
    expect(alto.interesesGenerados).toBeGreaterThan(bajo.interesesGenerados)
  })

  test('retorna ceros para capital inicial negativo', () => {
    const r = calcularInversion(-1_000, 200, 7, 10)
    expect(r.valorFinal).toBe(0)
    expect(r.capitalInvertido).toBe(0)
    expect(r.interesesGenerados).toBe(0)
  })

  test('retorna ceros para aportación mensual negativa', () => {
    const r = calcularInversion(5_000, -100, 7, 10)
    expect(r.valorFinal).toBe(0)
  })

  test('retorna ceros para tipo de interés negativo', () => {
    const r = calcularInversion(10_000, 200, -1, 20)
    expect(r.valorFinal).toBe(0)
    expect(r.capitalInvertido).toBe(0)
    expect(r.interesesGenerados).toBe(0)
  })

  test('retorna ceros para plazo negativo', () => {
    const r = calcularInversion(10_000, 200, 7, -5)
    expect(r.valorFinal).toBe(0)
    expect(r.capitalInvertido).toBe(0)
  })

  test('sin capital inicial ni aportaciones, valorFinal es cero', () => {
    const r = calcularInversion(0, 0, 7, 10)
    expect(r.valorFinal).toBeCloseTo(0, 5)
    expect(r.capitalInvertido).toBe(0)
    expect(r.interesesGenerados).toBeCloseTo(0, 5)
  })
})

describe('calcularPatrimonioNeto', () => {
  test('patrimonio positivo', () => {
    expect(calcularPatrimonioNeto(300_000, 150_000)).toBe(150_000)
  })

  test('patrimonio negativo (deudas superan activos)', () => {
    expect(calcularPatrimonioNeto(50_000, 80_000)).toBe(-30_000)
  })

  test('patrimonio cero (activos igual a pasivos)', () => {
    expect(calcularPatrimonioNeto(100_000, 100_000)).toBe(0)
  })

  test('sin deudas', () => {
    expect(calcularPatrimonioNeto(200_000, 0)).toBe(200_000)
  })

  test('sin activos', () => {
    expect(calcularPatrimonioNeto(0, 50_000)).toBe(-50_000)
  })
})

describe('calcularAhorroInicialEfectivo', () => {
  test('descuenta gastos extraordinarios del ahorro inicial', () => {
    expect(calcularAhorroInicialEfectivo(50_000, 15_000)).toBe(35_000)
  })

  test('sin gastos extraordinarios devuelve el ahorro inicial intacto', () => {
    expect(calcularAhorroInicialEfectivo(50_000, 0)).toBe(50_000)
  })

  test('gastos superiores al ahorro producen resultado negativo', () => {
    expect(calcularAhorroInicialEfectivo(5_000, 8_000)).toBe(-3_000)
  })

  test('ahorro inicial y gastos a cero devuelve cero', () => {
    expect(calcularAhorroInicialEfectivo(0, 0)).toBe(0)
  })

  test('ahorro inicial cero con gastos produce negativo', () => {
    expect(calcularAhorroInicialEfectivo(0, 3_000)).toBe(-3_000)
  })

  test('gastos exactamente iguales al ahorro dan cero', () => {
    expect(calcularAhorroInicialEfectivo(10_000, 10_000)).toBe(0)
  })
})

describe('generateAmortizationSchedule', () => {
  test('generates correct number of points (term * 12 + 1 including month 0)', () => {
    const schedule = generateAmortizationSchedule(160_000, 3, 30)
    expect(schedule.length).toBe(361) // 30*12 + 1
  })

  test('first point has full capital outstanding and zero accumulated', () => {
    const schedule = generateAmortizationSchedule(160_000, 3, 30)
    expect(schedule[0].outstandingPrincipal).toBe(160_000)
    expect(schedule[0].accumulatedPrincipal).toBe(0)
    expect(schedule[0].accumulatedInterest).toBe(0)
  })

  test('last point has zero outstanding and full capital amortized', () => {
    const schedule = generateAmortizationSchedule(160_000, 3, 30)
    const last = schedule[schedule.length - 1]
    expect(last.outstandingPrincipal).toBeCloseTo(0, 0)
    expect(last.accumulatedPrincipal).toBeCloseTo(160_000, 0)
  })

  test('accumulated principal + outstanding ≈ capital for any point', () => {
    const schedule = generateAmortizationSchedule(200_000, 2.5, 25)
    for (const point of schedule) {
      expect(point.accumulatedPrincipal + point.outstandingPrincipal).toBeCloseTo(200_000, 0)
    }
  })

  test('returns empty array for invalid inputs', () => {
    expect(generateAmortizationSchedule(0, 3, 30)).toEqual([])
    expect(generateAmortizationSchedule(100_000, -1, 30)).toEqual([])
    expect(generateAmortizationSchedule(100_000, 3, 0)).toEqual([])
    expect(generateAmortizationSchedule(NaN, 3, 30)).toEqual([])
  })

  test('works with zero interest rate', () => {
    const schedule = generateAmortizationSchedule(120_000, 0, 10)
    expect(schedule.length).toBe(121)
    const last = schedule[schedule.length - 1]
    expect(last.outstandingPrincipal).toBeCloseTo(0, 0)
    expect(last.accumulatedInterest).toBeCloseTo(0, 5)
  })

  test('total interest matches calcularHipoteca', () => {
    const schedule = generateAmortizationSchedule(160_000, 3, 30)
    const hipoteca = calcularHipoteca(200_000, 40_000, 3, 30)
    const last = schedule[schedule.length - 1]
    expect(last.accumulatedInterest).toBeCloseTo(hipoteca.interesesTotales, 0)
  })
})

describe('generateAmortizationScheduleWithContributions', () => {
  test('without contributions produces the same result as the base schedule', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withContrib = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0)
    expect(withContrib.length).toBe(base.length)
    expect(withContrib[0].outstandingPrincipal).toBeCloseTo(base[0].outstandingPrincipal, 0)
    const baseLast = base[base.length - 1]
    const withLast = withContrib[withContrib.length - 1]
    expect(withLast.outstandingPrincipal).toBeCloseTo(baseLast.outstandingPrincipal, 0)
    expect(withLast.accumulatedInterest).toBeCloseTo(baseLast.accumulatedInterest, 0)
  })

  test('with positive annual contributions, loan is paid off earlier', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withContrib = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0)
    expect(withContrib.length).toBeLessThan(base.length)
    expect(withContrib[withContrib.length - 1].outstandingPrincipal).toBeCloseTo(0, 0)
  })

  test('extra first-jan payment reduces outstanding more than base at month 12 when starting in January', () => {
    // Loan starts in January (month 0), so first Jan is at month 12
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withContrib = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 10_000, 0)
    const baseAt12 = base.find(p => p.month === 12)!
    const withAt12 = withContrib.find(p => p.month === 12)!
    expect(withAt12.outstandingPrincipal).toBeLessThan(baseAt12.outstandingPrincipal)
    expect(baseAt12.outstandingPrincipal - withAt12.outstandingPrincipal).toBeCloseTo(10_000, 0)
  })

  test('extraordinary payment only applied once (first January)', () => {
    const yearlyOnly = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 5_000, 0)
    const yearlyAndPeriodic = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 5_000, 0)
    // With both periodic + extra, loan ends even earlier
    expect(yearlyAndPeriodic.length).toBeLessThan(yearlyOnly.length)
  })

  test('lump sum never drives outstanding below zero', () => {
    // 40k annual contribution on a 30k loan should pay off at first January
    const schedule = generateAmortizationScheduleWithContributions(30_000, 3, 10, 40_000, 0, 0)
    for (const point of schedule) {
      expect(point.outstandingPrincipal).toBeGreaterThanOrEqual(0)
    }
  })

  test('returns empty array for invalid inputs', () => {
    expect(generateAmortizationScheduleWithContributions(0, 3, 25, 1000, 0, 0)).toEqual([])
    expect(generateAmortizationScheduleWithContributions(160_000, -1, 25, 1000, 0, 0)).toEqual([])
    expect(generateAmortizationScheduleWithContributions(160_000, 3, 0, 1000, 0, 0)).toEqual([])
  })

  test('loanStartMonth affects when first January falls', () => {
    // Starting in June (5), first Jan is 7 months away
    const startJune = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 10_000, 5)
    // Starting in November (10), first Jan is 2 months away
    const startNov = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 10_000, 10)
    // At month 12, november start should have had the extra payment applied sooner (month 2)
    // Both should have outstandingPrincipal lower than base, but at different months
    const baseAt2 = generateAmortizationSchedule(160_000, 3, 25).find(p => p.month === 2)!
    const novAt2 = startNov.find(p => p.month === 2)!
    const juneAt7 = startJune.find(p => p.month === 7)!
    const baseAt7 = generateAmortizationSchedule(160_000, 3, 25).find(p => p.month === 7)!
    expect(novAt2.outstandingPrincipal).toBeLessThan(baseAt2.outstandingPrincipal)
    expect(juneAt7.outstandingPrincipal).toBeLessThan(baseAt7.outstandingPrincipal)
  })
})

describe('generateAmortizationScheduleWithContributions - cuota mode', () => {
  test('cuota mode runs for full term when contributions are zero', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'cuota')
    expect(cuota.length).toBe(base.length)
  })

  test('cuota mode outstanding reaches zero at end of term', () => {
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'cuota')
    const last = cuota[cuota.length - 1]
    expect(last.outstandingPrincipal).toBeCloseTo(0, 0)
  })

  test('cuota mode accumulated interest is less than base (contributions reduce interest paid)', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'cuota')
    const baseLast = base[base.length - 1]
    const cuotaLast = cuota[cuota.length - 1]
    expect(cuotaLast.accumulatedInterest).toBeLessThan(baseLast.accumulatedInterest)
  })

  test('cuota mode outstanding is lower than base at every point after first contribution', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'cuota')
    // After month 12 (first January), cuota outstanding should be below base
    for (let i = 13; i < cuota.length; i++) {
      expect(cuota[i].outstandingPrincipal).toBeLessThanOrEqual(base[i].outstandingPrincipal + 0.01)
    }
  })

  test('cuota mode reduces term less than plazo mode (same contributions)', () => {
    const plazo = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'plazo')
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'cuota')
    // plazo pays off earlier → shorter schedule
    expect(plazo.length).toBeLessThan(cuota.length)
  })

  test('cuota mode with zero contributions produces same result as base', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'cuota')
    expect(cuota.length).toBe(base.length)
    const baseLast = base[base.length - 1]
    const cuotaLast = cuota[cuota.length - 1]
    expect(cuotaLast.accumulatedInterest).toBeCloseTo(baseLast.accumulatedInterest, 0)
  })

  test('cuota mode saves less interest than plazo mode for same contributions', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const baseTotalInterest = base[base.length - 1].accumulatedInterest
    const plazo = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'plazo')
    const cuota = generateAmortizationScheduleWithContributions(160_000, 3, 25, 5_000, 0, 0, 'cuota')
    const plazoSaved = baseTotalInterest - plazo[plazo.length - 1].accumulatedInterest
    const cuotaSaved = baseTotalInterest - cuota[cuota.length - 1].accumulatedInterest
    // plazo saves more interest (shorter loan duration)
    expect(plazoSaved).toBeGreaterThan(cuotaSaved)
  })
})

describe('generateAmortizationScheduleWithContributions - scheduled (extraordinary) contributions', () => {
  test('a scheduled contribution at month 6 reduces outstanding from that point', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withExtra = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'plazo', [
      { month: 6, amount: 20_000 },
    ])
    const baseAt6 = base.find(p => p.month === 6)!
    const extraAt6 = withExtra.find(p => p.month === 6)!
    expect(extraAt6.outstandingPrincipal).toBeLessThan(baseAt6.outstandingPrincipal)
    expect(extraAt6.accumulatedPrincipal).toBeGreaterThan(baseAt6.accumulatedPrincipal)
  })

  test('scheduled contribution reduces total term in plazo mode', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withExtra = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'plazo', [
      { month: 12, amount: 30_000 },
    ])
    expect(withExtra.length).toBeLessThan(base.length)
  })

  test('multiple scheduled contributions are all applied', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withExtra = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'plazo', [
      { month: 12, amount: 10_000 },
      { month: 24, amount: 10_000 },
    ])
    const baseLast = base[base.length - 1]
    const extraLast = withExtra[withExtra.length - 1]
    expect(extraLast.accumulatedInterest).toBeLessThan(baseLast.accumulatedInterest)
    expect(withExtra.length).toBeLessThan(base.length)
  })

  test('scheduled contribution in cuota mode lowers monthly payment after the contribution', () => {
    const base = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'cuota')
    const withExtra = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'cuota', [
      { month: 12, amount: 20_000 },
    ])
    // After contribution in cuota mode, outstanding at month 13 should be lower
    const baseAt13 = base.find(p => p.month === 13)!
    const extraAt13 = withExtra.find(p => p.month === 13)!
    expect(extraAt13.outstandingPrincipal).toBeLessThan(baseAt13.outstandingPrincipal)
  })

  test('scheduled contribution beyond term is ignored', () => {
    const base = generateAmortizationSchedule(160_000, 3, 25)
    const withExtra = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'plazo', [
      { month: 99999, amount: 50_000 },
    ])
    expect(withExtra.length).toBe(base.length)
  })

  test('contribution larger than outstanding only reduces to zero', () => {
    const withExtra = generateAmortizationScheduleWithContributions(160_000, 3, 25, 0, 0, 0, 'plazo', [
      { month: 12, amount: 999_999 },
    ])
    const last = withExtra[withExtra.length - 1]
    expect(last.outstandingPrincipal).toBeCloseTo(0, 0)
    expect(last.accumulatedPrincipal).toBeCloseTo(160_000, 0)
  })
})

describe('generateInvestmentSchedule', () => {
  test('generates correct number of points (months + 1 including month 0)', () => {
    const schedule = generateInvestmentSchedule(10_000, 200, 7, 120)
    expect(schedule.length).toBe(121)
  })

  test('first point has initial capital as value and contributed', () => {
    const schedule = generateInvestmentSchedule(10_000, 200, 7, 60)
    expect(schedule[0].value).toBe(10_000)
    expect(schedule[0].contributed).toBe(10_000)
    expect(schedule[0].month).toBe(0)
  })

  test('contributed grows linearly with monthly contribution', () => {
    const schedule = generateInvestmentSchedule(5_000, 300, 7, 24)
    expect(schedule[24].contributed).toBe(5_000 + 300 * 24)
  })

  test('value is greater than contributed when return is positive', () => {
    const schedule = generateInvestmentSchedule(10_000, 200, 7, 120)
    const last = schedule[schedule.length - 1]
    expect(last.value).toBeGreaterThan(last.contributed)
  })

  test('value equals contributed when return is zero', () => {
    const schedule = generateInvestmentSchedule(10_000, 200, 0, 60)
    const last = schedule[schedule.length - 1]
    expect(last.value).toBeCloseTo(last.contributed, 5)
  })

  test('final value matches calcularInversion', () => {
    const schedule = generateInvestmentSchedule(10_000, 200, 7, 240)
    const result = calcularInversion(10_000, 200, 7, 20)
    const last = schedule[schedule.length - 1]
    expect(last.value).toBeCloseTo(result.valorFinal, 2)
  })

  test('returns empty array for invalid inputs', () => {
    expect(generateInvestmentSchedule(-1, 200, 7, 60)).toEqual([])
    expect(generateInvestmentSchedule(10_000, -1, 7, 60)).toEqual([])
    expect(generateInvestmentSchedule(10_000, 200, 7, -1)).toEqual([])
    expect(generateInvestmentSchedule(NaN, 200, 7, 60)).toEqual([])
  })

  test('with zero initial capital, only contributions grow', () => {
    const schedule = generateInvestmentSchedule(0, 500, 5, 12)
    expect(schedule[0].value).toBe(0)
    expect(schedule[12].contributed).toBe(500 * 12)
    expect(schedule[12].value).toBeGreaterThan(schedule[12].contributed)
  })
})
