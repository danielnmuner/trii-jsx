import { selectActiveIssuers } from './client'

describe('selectActiveIssuers', () => {
  it('keeps only issuers flagged is_active === true', () => {
    const result = selectActiveIssuers([
      { symbol: 'ECOPETROL', is_active: true },
      { symbol: 'ISA', is_active: false },
      { symbol: 'NUCO' },
      { symbol: 'cibest', is_active: true },
      { symbol: 'CIBEST', is_active: true },
      { symbol: '  ', is_active: true },
    ])

    expect(result.symbols).toEqual(['ECOPETROL', 'CIBEST'])
    expect(result.issuers.map((issuer) => issuer.symbol)).toEqual(['ECOPETROL', 'CIBEST'])
  })
})
