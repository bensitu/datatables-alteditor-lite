import { editSalesView, initialSales, reportSalesError } from './sales.js';

const figure = document.querySelector('#sales');
const plotly = globalThis.Plotly;
function render(records) {
  const regions = records.map((row) => row.region);
  const units = records.map((row) => row.units);
  const total = units.reduce((sum, value) => sum + value, 0);
  return plotly.react(
    figure,
    [
      {
        type: 'table',
        domain: { y: [0.53, 1] },
        header: { values: ['Region', 'Units'] },
        cells: {
          values: [
            [...regions, 'Total'],
            [...units, total],
          ],
        },
      },
      { type: 'bar', x: regions, y: units, marker: { color: '#347761' } },
    ],
    {
      margin: { t: 10, r: 12, b: 32, l: 42 },
      yaxis: { domain: [0, 0.45], rangemode: 'tozero' },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false },
  );
}
const records = initialSales();
try {
  await render(records);
  editSalesView(records, render, () => plotly.purge(figure));
} catch (error) {
  reportSalesError(error);
}
