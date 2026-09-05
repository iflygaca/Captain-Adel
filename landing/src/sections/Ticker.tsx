const PARTS = [
  'GACAR PART 1 — DEFINITIONS', 'GACAR PART 61 — CERTIFICATION: PILOTS',
  'GACAR PART 91 — GENERAL OPERATING & FLIGHT RULES', 'GACAR PART 121 — AIR CARRIER OPERATIONS',
  'GACAR PART 135 — COMMUTER & ON-DEMAND', 'GACAR PART 141 — PILOT SCHOOLS',
  'GACAR PART 43 — MAINTENANCE', 'GACAR PART 65 — AIRMEN OTHER THAN FLIGHT CREW',
  '§91.155 — VFR WEATHER MINIMA', '§91.151 — FUEL REQUIREMENTS',
  '§61.57 — RECENT FLIGHT EXPERIENCE', '§121.471 — FLIGHT TIME LIMITATIONS',
]

export default function Ticker() {
  const items = [...PARTS, ...PARTS]
  return (
    <div
      className="relative border-y overflow-hidden"
      style={{
        borderColor: 'var(--color-void-900)',
        backgroundColor: 'var(--color-void)',
      }}
    >
      <div className="flex whitespace-nowrap anim-ticker py-3">
        {items.map((p, i) => (
          <span key={i} className="flex items-center font-mono2 text-[10px] tracking-[0.22em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="px-6">{p}</span>
            <span style={{ color: 'var(--color-brand-teal)' }}>✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}
