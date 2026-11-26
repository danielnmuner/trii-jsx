import { parseAmount } from './parseAmount'

describe('parseAmount', () => {
  it.each([
    ['2500', 2_500],
    ['2,500', 2_500],
    ['2.500', 2_500],
    ['1,250,000', 1_250_000],
    ['1.250.000', 1_250_000],
    ['$ 10.000.000', 10_000_000],
    ['2500.5', 2_500.5],
    ['2,5', 2.5],
    ['1,250,000.50', 1_250_000.5],
    ['1.250.000,50', 1_250_000.5],
  ])('reads %s as %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })

  it.each(['', 'abc', '2,50,0', '1.2.3', '-5'])('rejects %j', (raw) => {
    expect(parseAmount(raw)).toBeNaN()
  })
})
