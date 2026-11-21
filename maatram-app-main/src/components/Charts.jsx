// Dependency-free SVG/CSS charts for the dashboard and reports.
const PALETTE = ["#f5b914", "#2363a5", "#247344", "#9a5700", "#6341a5", "#c0392b", "#707070"];

export function BarList({ items, colorFor, empty = "No data for this selection." }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => !i.value)) return <p className="chart-empty">{empty}</p>;
  return (
    <div className="bar-list">
      {items.map((item, index) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label" title={item.label}>{item.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: colorFor ? colorFor(item.label) : PALETTE[index % PALETTE.length] }} />
          </div>
          <strong className="bar-value">{item.value}{item.sub ? <em>{item.sub}</em> : null}</strong>
        </div>
      ))}
    </div>
  );
}

export function StackedBar({ items, colorFor }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return <p className="chart-empty">No queries in this selection.</p>;
  return (
    <div>
      <div className="stack-bar" role="img" aria-label="Status distribution">
        {items.filter((i) => i.value).map((i) => (
          <div key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: colorFor(i.label) }} title={`${i.label}: ${i.value}`} />
        ))}
      </div>
      <div className="chart-legend">
        {items.map((i) => (<span key={i.label}><i style={{ background: colorFor(i.label) }} />{i.label} <b>{i.value}</b></span>))}
      </div>
    </div>
  );
}

export function TrendChart({ data }) {
  const w = 560; const h = 170; const pad = { l: 28, r: 10, t: 10, b: 24 };
  const max = Math.max(2, ...data.map((d) => Math.max(d.created, d.resolved)));
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const line = (key) => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="trend-svg" role="img" aria-label="Queries created and resolved in the last 14 days">
        {[0, 0.5, 1].map((t) => (<g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="#e7e7e2" /><text x={4} y={y(max * t) + 4} fontSize="10" fill="#707070">{Math.round(max * t)}</text></g>))}
        <path d={line("created")} fill="none" stroke="#f5b914" strokeWidth="2.5" />
        <path d={line("resolved")} fill="none" stroke="#247344" strokeWidth="2.5" />
        {data.map((d, i) => (i % 3 === 0 || i === data.length - 1) ? <text key={d.label} x={x(i)} y={h - 6} fontSize="9.5" textAnchor="middle" fill="#707070">{d.label}</text> : null)}
      </svg>
      <div className="chart-legend"><span><i style={{ background: "#f5b914" }} />Created</span><span><i style={{ background: "#247344" }} />Resolved</span></div>
    </div>
  );
}
