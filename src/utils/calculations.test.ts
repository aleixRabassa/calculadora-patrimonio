import { describe, test, expect } from 'vitest'
import { calcularHipoteca, calcularInversion, calcularPatrimonioNeto, calcularSalarioNeto } from './calculations'

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
