// Slow-drifting gradient mesh (navy/gold/teal blurred blobs) — ambient, not
// a static grid/dot pattern. Drift keyframes + reduced-motion handling live
// in index.css; transform-only animation keeps it off the layout path.
export function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Against near-black, the same opacities that read balanced on navy
          either dominate (blue) or wash out (gold/teal) — retuned for #050505. */}
      <div
        className="aurora-blob aurora-a"
        style={{ top: '-18%', left: '-12%', width: '55vw', height: '55vw', background: 'rgba(45, 75, 170, 0.42)' }}
      />
      <div
        className="aurora-blob aurora-b"
        style={{ bottom: '-22%', right: '-12%', width: '52vw', height: '52vw', background: 'rgba(201, 162, 39, 0.28)' }}
      />
      <div
        className="aurora-blob aurora-c"
        style={{ top: '28%', left: '42%', width: '42vw', height: '42vw', background: 'rgba(22, 180, 168, 0.32)' }}
      />
    </div>
  )
}
