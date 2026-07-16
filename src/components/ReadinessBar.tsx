export function colorFor(value: number) {
  if (value >= 85) return '#42E695'
  if (value >= 65) return '#FFD166'
  return '#FF5F73'
}

export default function ReadinessBar({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const color = colorFor(value)
  const height = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div className="w-full min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-muted truncate">Readiness</span>
        <span className="text-xs font-mono font-semibold shrink-0" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className={`readiness-bar-track w-full ${height}`}>
        <div
          className={`${height} rounded-full transition-all`}
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}88` }}
        />
      </div>
    </div>
  )
}
