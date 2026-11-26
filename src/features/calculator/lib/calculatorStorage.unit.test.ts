import { readCalculatorState, writeCalculatorState, type StoredCalculator } from './calculatorStorage'

const state: StoredCalculator = {
  compare: true,
  scenarios: {
    A: { symbol: 'ECOPETROL', buyPrice: '2.350', sellPrice: '2.380', sizeMode: 'amount', shares: '', amount: '70.000.000' },
    B: { symbol: null, buyPrice: '', sellPrice: '', sizeMode: 'shares', shares: '100', amount: '' },
  },
}

describe('calculatorStorage', () => {
  afterEach(() => window.localStorage.clear())

  it('round-trips the calculator inputs', () => {
    writeCalculatorState(state)
    expect(readCalculatorState()).toEqual(state)
  })

  it('returns null when nothing was saved', () => {
    expect(readCalculatorState()).toBeNull()
  })

  it('ignores corrupt or incomplete data', () => {
    window.localStorage.setItem('trii.calculator.v1', '{not json')
    expect(readCalculatorState()).toBeNull()
    window.localStorage.setItem('trii.calculator.v1', JSON.stringify({ compare: true, scenarios: { A: state.scenarios.A } }))
    expect(readCalculatorState()).toBeNull()
  })
})
