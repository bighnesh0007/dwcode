/**
 * Skill radar: solved share per category, on a spider chart. With fewer than
 * three categories a radar says nothing, so it falls back to bars.
 */
interface Skill {
  category: string;
  solved: number;
  total: number;
}

const SIZE = 260;
const C = SIZE / 2;
const R = 90;

export function SkillRadar({ skills }: { skills: Skill[] }) {
  const axes = skills.filter((s) => s.total > 0).slice(0, 8);
  if (axes.length === 0) return <p className="text-sm text-muted-foreground">No problems solved yet.</p>;
  if (axes.length < 3) {
    return (
      <ul className="space-y-2">
        {axes.map((s) => (
          <li key={s.category} className="text-sm">
            <div className="flex justify-between"><span>{s.category}</span><span className="text-muted-foreground">{s.solved}/{s.total}</span></div>
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(s.solved / s.total) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    );
  }
  const point = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  };
  const ring = (f: number) => axes.map((_, i) => point(i, R * f).join(",")).join(" ");
  const shape = axes.map((s, i) => point(i, R * Math.max(0.04, s.solved / s.total)).join(",")).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-xs mx-auto" role="img" aria-label="Solved share by category">
        {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" className="stroke-border" strokeWidth={1} />)}
        {axes.map((_, i) => { const [x, y] = point(i, R); return <line key={i} x1={C} y1={C} x2={x} y2={y} className="stroke-border" strokeWidth={1} />; })}
        <polygon points={shape} className="fill-primary/25 stroke-primary" strokeWidth={2} />
        {axes.map((s, i) => {
          const [x, y] = point(i, R + 18);
          return <text key={s.category} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">{s.category}</text>;
        })}
      </svg>
      <figcaption className="sr-only">
        {axes.map((s) => `${s.category}: ${s.solved} of ${s.total}`).join("; ")}
      </figcaption>
    </figure>
  );
}
