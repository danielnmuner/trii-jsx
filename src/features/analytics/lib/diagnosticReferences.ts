export type DiagnosticReferenceItem = {
  title: string
  formulas: string[]
  rules: string[]
  description: string
}

export const tacticalDiagnosticReferences: DiagnosticReferenceItem[] = [
  {
    title: 'Relative spread',
    formulas: [
      String.raw`\text{Mid Price}=\frac{P_{ask}+P_{bid}}{2}`,
      String.raw`\text{Spread BPS}=\left(\frac{P_{ask}-P_{bid}}{\text{Mid Price}}\right)\times10{,}000`,
    ],
    rules: [
      String.raw`\text{Spread BPS}>150\Rightarrow\text{High Illiquidity}`,
      String.raw`\text{Spread BPS}\leq30\Rightarrow\text{High Liquidity}`,
      String.raw`\text{Otherwise}\Rightarrow\text{Normal Spread}`,
    ],
    description:
      'Prioritize this read when you need to decide whether you can execute quickly or whether crossing cost is already too high; if the spread in basis points widens, a market order loses quality even when book bias looks attractive.',
  },
  {
    title: 'Book pressure',
    formulas: [
      String.raw`\text{OBI}_{L1}=\frac{V_{bid,1}-V_{ask,1}}{V_{bid,1}+V_{ask,1}}`,
      String.raw`\text{OBI}_{Top5}=\frac{\sum_{i=1}^{5}V_{bid,i}-\sum_{i=1}^{5}V_{ask,i}}{\sum_{i=1}^{5}V_{bid,i}+\sum_{i=1}^{5}V_{ask,i}}`,
    ],
    rules: [
      String.raw`\text{OBI}_{L1}>0.6\Rightarrow\text{Strong Buy Pressure}`,
      String.raw`\text{OBI}_{L1}<-0.6\Rightarrow\text{Strong Sell Pressure}`,
      String.raw`\text{Otherwise}\Rightarrow\text{Balanced Top Of Book}`,
    ],
    description:
      'Use this metric to read who controls the touch and whether that dominance survives in depth; level-1 and top-5 Order Book Imbalance (OBI) help separate real interest from a book that looks heavy but lacks consistency.',
  },
  {
    title: 'Microprice delta',
    formulas: [
      String.raw`\text{Microprice}=\frac{V_{bid,1}\cdot P_{ask}+V_{ask,1}\cdot P_{bid}}{V_{bid,1}+V_{ask,1}}`,
      String.raw`\Delta_{micro}=\text{Microprice}-\text{Mid Price}`,
    ],
    rules: [
      String.raw`\Delta_{micro}<0\Rightarrow\text{Bearish Bias}`,
      String.raw`\Delta_{micro}>0\Rightarrow\text{Bullish Bias}`,
      String.raw`\Delta_{micro}=0\Rightarrow\text{Neutral Bias}`,
    ],
    description:
      'Treat this read as a level-1 mass validation: if microprice leans below mid, visible liquidity favors selling pressure; if it leans above, it favors buying continuation.',
  },
  {
    title: 'Price vs VWAP',
    formulas: [
      String.raw`\text{VWAP}_{accumulated}=\frac{\text{Traded Value}}{\text{Traded Volume}}`,
      String.raw`\Delta_{VWAP}=P_{last}-\text{VWAP}_{accumulated}`,
    ],
    rules: [
      String.raw`\Delta_{VWAP}>0\Rightarrow\text{Trading Above Average}`,
      String.raw`\Delta_{VWAP}<0\Rightarrow\text{Trading Below Average}`,
      String.raw`\Delta_{VWAP}=0\Rightarrow\text{At Average}`,
    ],
    description:
      'This comparison shows whether the current price is trading at a premium or discount versus the session’s accumulated volume-weighted average price (VWAP); it helps separate genuine impulse from moves that may already be tired.',
  },
]

export const alertDiagnosticReferences: DiagnosticReferenceItem[] = [
  {
    title: 'Z-Score spread BPS',
    formulas: [String.raw`Z_{spread}=\frac{\text{Spread BPS}-\mu_{spread}}{\sigma_{spread}}`],
    rules: [
      String.raw`Z_{spread}\geq2.0\Rightarrow\text{Spread Out Of Range}`,
      String.raw`Z_{spread}\leq-2.0\Rightarrow\text{Extreme Compression}`,
      String.raw`\text{Otherwise}\Rightarrow\text{Normal Range}`,
    ],
    description:
      'Give this read high priority when entry cost shifts abnormally relative to its own history, because a spread in basis points (BPS) that moves out of range can invalidate a trade that is directionally right but executionally poor.',
  },
  {
    title: 'Z-Score OBI Top 5',
    formulas: [String.raw`Z_{OBI5}=\frac{\text{OBI}_{Top5}-\mu_{OBI5}}{\sigma_{OBI5}}`],
    rules: [
      String.raw`Z_{OBI5}\geq2.0\Rightarrow\text{Abnormal Buy Load}`,
      String.raw`Z_{OBI5}\leq-2.0\Rightarrow\text{Abnormal Sell Load}`,
      String.raw`\text{Otherwise}\Rightarrow\text{Normal Depth}`,
    ],
    description:
      'Prioritize this read to detect when top-5 Order Book Imbalance (OBI) stops being normal for a symbol and starts to look like institutional loading or aggressive distribution that deserves immediate attention.',
  },
  {
    title: 'Spoofing risk',
    formulas: [String.raw`\text{OBI}_{L1}>0.5\land\Delta_{micro}<0\land Z_{spread}\geq1.5`],
    rules: [
      String.raw`\text{Condition True}\Rightarrow\text{Trap Alert}`,
      String.raw`\text{Condition False}\Rightarrow\text{No Active Signal}`,
    ],
    description:
      'This rule helps you avoid chasing an apparently bid-heavy top of book that is actually contradicted by depth and a riskier spread; when it appears, the priority should be to review before executing because level-1 Order Book Imbalance (OBI) and microprice are decoupled.',
  },
]
