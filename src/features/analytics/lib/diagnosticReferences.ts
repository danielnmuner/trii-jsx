export type DiagnosticReferenceItem = {
  title: string
  primaryFormula: string
  supportingFormula?: string
  rules: string[]
  description: string
}

export type UserGuideFaqItem = {
  question: string
  answerParagraphs: string[]
}

export const tacticalDiagnosticReferences: DiagnosticReferenceItem[] = [
  {
    title: 'Relative Spread',
    primaryFormula: String.raw`\text{Spread BPS}=\left(\frac{P_{ask}-P_{bid}}{\text{Mid Price}}\right)\times10{,}000`,
    supportingFormula: String.raw`\text{Mid Price}=\frac{P_{ask}+P_{bid}}{2}`,
    rules: [
      'Spread BPS > 150: iliquidez alta.',
      'Spread BPS <= 30: liquidez alta.',
      'Entre ambos niveles: spread normal.',
    ],
    description:
      'Úsala para decidir si vale la pena cruzar rápido o si el costo de ejecución ya es demasiado alto. Un spread abierto puede dañar una operación buena en dirección pero mala en ejecución.',
  },
  {
    title: 'Book Pressure',
    primaryFormula: String.raw`\text{OBI}_{L1}=\frac{V_{bid,1}-V_{ask,1}}{V_{bid,1}+V_{ask,1}}`,
    supportingFormula: String.raw`\text{OBI}_{Top5}=\frac{\sum_{i=1}^{5}V_{bid,i}-\sum_{i=1}^{5}V_{ask,i}}{\sum_{i=1}^{5}V_{bid,i}+\sum_{i=1}^{5}V_{ask,i}}`,
    rules: [
      'OBI L1 > 0.6: presión compradora fuerte.',
      'OBI L1 < -0.6: presión vendedora fuerte.',
      'Rango intermedio: punta balanceada.',
    ],
    description:
      'Sirve para leer quién manda en la punta y si ese dominio realmente se sostiene en profundidad. Ayuda a separar interés real de un libro que parece cargado pero no aguanta.',
  },
  {
    title: 'Microprice Delta',
    primaryFormula: String.raw`\Delta_{micro}=\text{Microprice}-\text{Mid Price}`,
    supportingFormula: String.raw`\text{Microprice}=\frac{V_{bid,1}\cdot P_{ask}+V_{ask,1}\cdot P_{bid}}{V_{bid,1}+V_{ask,1}}`,
    rules: [
      'Delta micro < 0: sesgo bajista visible.',
      'Delta micro > 0: sesgo alcista visible.',
      'Delta micro = 0: sesgo neutral.',
    ],
    description:
      'Funciona como validación de masa en nivel 1. Si el microprice cae por debajo del mid, la liquidez visible favorece presión vendedora; si queda arriba, favorece continuidad compradora.',
  },
  {
    title: 'Price vs VWAP',
    primaryFormula: String.raw`\Delta_{VWAP}=P_{last}-\text{VWAP}_{accumulated}`,
    supportingFormula: String.raw`\text{VWAP}_{accumulated}=\frac{\text{Traded Value}}{\text{Traded Volume}}`,
    rules: [
      'Delta VWAP > 0: precio con prima frente al flujo.',
      'Delta VWAP < 0: precio con descuento frente al flujo.',
      'Cerca de 0: precio alineado con el promedio negociado.',
    ],
    description:
      'Compara el último precio contra el VWAP acumulado de la jornada para saber si el impulso sigue sano o si el movimiento ya viene estirado frente al flujo ejecutado.',
  },
]

export const alertDiagnosticReferences: DiagnosticReferenceItem[] = [
  {
    title: 'Z-Score Spread BPS',
    primaryFormula: String.raw`Z_{spread}=\frac{\text{Spread BPS}-\mu_{spread}}{\sigma_{spread}}`,
    rules: [
      'Z spread >= 2.0: costo fuera de rango.',
      'Z spread <= -2.0: compresión extrema.',
      'Entre ambos niveles: rango normal.',
    ],
    description:
      'Priorízala cuando el costo de entrada cambia de forma atípica frente a su propia historia. Un spread fuera de rango puede invalidar una operación aunque el sesgo direccional parezca correcto.',
  },
  {
    title: 'Z-Score OBI Top 5',
    primaryFormula: String.raw`Z_{OBI5}=\frac{\text{OBI}_{Top5}-\mu_{OBI5}}{\sigma_{OBI5}}`,
    rules: [
      'Z OBI5 >= 2.0: carga compradora anormal.',
      'Z OBI5 <= -2.0: carga vendedora anormal.',
      'Entre ambos niveles: profundidad normal.',
    ],
    description:
      'Ayuda a detectar cuándo la profundidad deja de comportarse normal para ese símbolo y empieza a parecer carga institucional o salida agresiva que vale la pena seguir.',
  },
  {
    title: 'Spoofing Risk',
    primaryFormula: String.raw`\text{OBI}_{L1}>0.5\land\Delta_{micro}<0\land Z_{spread}\geq1.5`,
    rules: [
      'Condición verdadera: revisar antes de ejecutar.',
      'Condición falsa: no hay señal activa de trampa.',
    ],
    description:
      'Sirve para no perseguir una punta aparentemente compradora que está siendo contradicha por microprice y por un spread más riesgoso. Es una alerta táctica, no una señal de entrada automática.',
  },
]

export const faqEntries: UserGuideFaqItem[] = [
  {
    question: '¿En qué horario puedo comprar y vender acciones?',
    answerParagraphs: [
      'Las acciones se negocian en los horarios definidos por la BVC en días hábiles. Fuera de ese horario puedes dejar órdenes programadas para que entren cuando el mercado abra.',
    ],
  },
  {
    question: '¿Qué es Acciones y Valores?',
    answerParagraphs: [
      'Acciones y Valores S.A. SCB es la firma comisionista que intermedia las operaciones bursátiles asociadas a la experiencia de Trii.',
    ],
  },
  {
    question: '¿Cuál es la relación entre trii y Acciones y Valores S.A. SCB?',
    answerParagraphs: [
      'Trii es la capa tecnológica y de experiencia de usuario. Acciones y Valores S.A. SCB es el intermediario que cursa las órdenes al mercado y custodia los recursos y posiciones dentro del marco regulatorio aplicable.',
    ],
  },
  {
    question: '¿Qué es la BVC?',
    answerParagraphs: [
      'La Bolsa de Valores de Colombia es la infraestructura de mercado donde se negocian, registran y administran diferentes productos del mercado de capitales colombiano.',
    ],
  },
  {
    question: '¿Qué es la Superintendencia Financiera?',
    answerParagraphs: [
      'Es la entidad que supervisa el sistema financiero colombiano y vela por la estabilidad, la confianza del mercado y la protección de inversionistas y ahorradores.',
    ],
  },
  {
    question: '¿Qué es Deceval?',
    answerParagraphs: [
      'Deceval es el depósito centralizado de valores de Colombia. Custodia y administra valores, además de apoyar procesos de compensación y liquidación.',
    ],
  },
  {
    question: '¿Cuánto me cobran por realizar compras y ventas?',
    answerParagraphs: [
      'La comisión depende del monto operado y del plan del usuario. En la referencia operativa actual, hasta cierto umbral se cobra una tarifa fija y por encima de ese nivel se aplica una comisión porcentual más IVA.',
      'Si vas a usar este dato para una decisión operativa, conviene confirmar la tarifa vigente directamente en Trii o en Acciones y Valores antes de operar.',
    ],
  },
  {
    question: '¿Qué es la subasta de cierre y cómo funciona?',
    answerParagraphs: [
      'Es el mecanismo que define el precio de cierre de la jornada. Durante ese tramo se acumulan órdenes y el calce final ocurre al terminar la subasta, no de forma inmediata como en la rueda continua.',
    ],
  },
  {
    question: '¿Qué se debe tener en cuenta para operar en la subasta de cierre?',
    answerParagraphs: [
      'Conviene revisar precio indicativo, profundidad, volumen disponible y distancia entre compra y venta. Una orden puede ejecutar parcialmente o no ejecutar si al precio de equilibrio no hay suficiente contraparte.',
      'En ese contexto, las órdenes límite suelen ser más útiles que las órdenes a mercado para controlar el precio aceptado.',
    ],
  },
  {
    question: '¿Qué es un rebalanceo de índices?',
    answerParagraphs: [
      'Es un ajuste en la composición o en los pesos de las acciones dentro de un índice. Cuando ocurre, los fondos que replican ese índice pueden necesitar comprar o vender acciones para alinearse con la nueva composición.',
    ],
  },
  {
    question: '¿Cómo puedo aprovechar la subasta de cierre para comprar o vender?',
    answerParagraphs: [
      'La idea es usar el precio indicativo, la profundidad y el volumen para decidir un precio límite razonable, en vez de reaccionar solo al último precio negociado.',
      'Si el cierre final queda dentro de tu condición, la orden puede ejecutar; si no, simplemente no entra al precio que no querías aceptar.',
    ],
  },
  {
    question: '¿Cómo sé en Colombia que ese día existe un rebalanceo de índice que puede generar compras o ventas institucionales?',
    answerParagraphs: [
      'Estos eventos suelen anunciarse con anticipación. Lo correcto es revisar calendarios y comunicados oficiales del proveedor del índice y de la infraestructura de mercado relevante antes de la jornada.',
    ],
  },
  {
    question: '¿Qué es un Stop Loss en trii Pro y cómo me sirve?',
    answerParagraphs: [
      'Es una orden diseñada para limitar pérdidas al activar una venta cuando el precio cae hasta un umbral definido por ti.',
      'Su utilidad principal es ayudar a controlar riesgo y disciplinar salidas, especialmente cuando no puedes seguir el mercado tick a tick.',
    ],
  },
  {
    question: '¿Qué es Trader Trii MC?',
    answerParagraphs: [
      'Es un perfil de operación enfocado en seguimiento intradía del mercado colombiano, con lectura continua de precio, volumen, profundidad, subasta de cierre y eventos relevantes para tomar decisiones tácticas.',
    ],
  },
]
