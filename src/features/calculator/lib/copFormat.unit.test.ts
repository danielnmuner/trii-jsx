import { parseAmount } from './parseAmount'
import {
  caretAfterSignificant,
  countSignificant,
  formatAmountForInput,
  formatCompactCop,
  formatCop,
  formatSignedCop,
  formatSignedPercent,
  formatTypedAmount,
} from './copFormat'

describe('copFormat', () => {
  it('formats pesos with Colombian separators', () => {
    expect(formatCop(10_089_789)).toBe('10.089.789')
    expect(formatCop(2_507.448, 2)).toBe('2.507,45')
    expect(formatSignedCop(89_936)).toBe('+89.936')
    expect(formatSignedCop(-1_200)).toBe('−1.200')
    expect(formatSignedPercent(0.898)).toBe('+0,90%')
    expect(formatCompactCop(200_000)).toBe('200K')
    expect(formatCompactCop(-1_500_000)).toBe('−1,5M')
    expect(formatAmountForInput(2_350)).toBe('2.350')
  })

  it.each([
    ['1', '1'],
    ['1000', '1.000'],
    ['10000000', '10.000.000'],
    ['10.000.0001', '100.000.001'],
    ['2500,5', '2.500,5'],
    ['2500,567', '2.500,56'],
    ['2500,', '2.500,'],
    [',5', '0,5'],
    ['007', '7'],
    ['$ 9.600', '9.600'],
    ['2,5,0', '2,50'],
  ])('reformats typed %j as %j', (raw, expected) => {
    expect(formatTypedAmount(raw)).toBe(expected)
  })

  it('drops decimals for whole-number fields', () => {
    expect(formatTypedAmount('1500,5', false)).toBe('15.005')
  })

  it('round-trips: what the field shows parses back to the same number', () => {
    for (const typed of ['10000000', '2500,5', '9600', '1234567,89']) {
      const shown = formatTypedAmount(typed)
      expect(parseAmount(shown)).toBe(Number(typed.replace(',', '.')))
    }
  })

  it('keeps the caret after the same digit when separators are inserted', () => {
    // Typing the 4th digit of "100|" → "1.000": the caret stays after that digit.
    const formatted = formatTypedAmount('1000')
    expect(caretAfterSignificant(formatted, countSignificant('1000'))).toBe(formatted.length)
    // Caret after the 2nd digit of "12345" → "12.345": index 2 ("12|.345").
    expect(caretAfterSignificant(formatTypedAmount('12345'), 2)).toBe(2)
  })
})
