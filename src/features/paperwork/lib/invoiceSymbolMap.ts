export const invoiceSymbolAliasMap = {
  NUCO: ['NU HOLDINGS LTD'],
  ECOPETROL: ['ECOPETROL'],
  TERPEL: ['ORGANIZACION TER', 'ORGANIZACION TERPEL'],
  GEB: ['GRUPO ENERGIA BO', 'EMPR ENERG DE BGTA', 'EMPRESA DE ENERGI'],
  GRUPOARGOS: ['GRUPO ARGOS S A', 'AO GRUPO ARGOS GRUPO ARGOS S A', 'GRUPO ARGOS'],
  CIBEST: ['GRUPO CIBEST SA', 'GRUPO CIBEST'],
  EXITO: ['EXITO'],
} as const

export type InvoiceMappedSymbol = keyof typeof invoiceSymbolAliasMap
