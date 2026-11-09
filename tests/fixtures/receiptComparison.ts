// Identical source text and image layout for both engines. Synthetic, not a
// real supermarket accuracy benchmark. Includes three genuine adjacent MILKs.
const names = ['MILK', 'BREAD', 'BUTTER', 'HONEY', 'CARROTS', 'APPLES', 'BEANS', 'PASTA', 'RICE', 'PEARS']
export const comparisonBasket = Array.from({ length: 50 }, (_, i) => ({ name: names[i % names.length], price: 1 + Math.floor(i / 10) }))
for (const i of [19, 20, 21]) comparisonBasket[i] = { name: 'MILK', price: 2 }
export const comparisonTotal = comparisonBasket.reduce((sum, item) => sum + item.price, 0)
const lines = comparisonBasket.map(item => item.name.padEnd(18) + item.price.toFixed(2))
export const comparisonSections = [
  ['LIDL', '04/11/2026', ...lines.slice(0, 21)],
  lines.slice(17, 39),
  [...lines.slice(35), 'FADED PRICE', 'TOTAL EUR'.padEnd(18) + comparisonTotal.toFixed(2)],
]
export const comparisonRows = comparisonSections.map((section, photo) => section.map((text, i) => ({
  photo, text, top: (40 + i * 42 - 25) / (50 + section.length * 42),
  bottom: (40 + i * 42 + 3) / (50 + section.length * 42), confidence: 0.95,
})))
export const unreadableSections = [['TESCO', '04/11/2026', 'BEANS             2.00', 'FADED PRICE', 'TOTAL EUR         2.00']]
