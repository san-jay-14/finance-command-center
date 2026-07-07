import { motion } from 'framer-motion'
import { Rnd } from 'react-rnd'
import type { LivePrices } from '../hooks/useLivePrices'
import { componentRegistry } from '../lib/componentRegistry'
import { useWindowsStore, type WindowEntry } from '../store/windowsStore'

export function Window({ entry, livePrices }: { entry: WindowEntry; livePrices: LivePrices }) {
  const closeWindow = useWindowsStore((s) => s.closeWindow)
  const bringToFront = useWindowsStore((s) => s.bringToFront)
  const updateRect = useWindowsStore((s) => s.updateRect)

  const Component = componentRegistry[entry.componentType]

  return (
    <Rnd
      size={{ width: entry.size.w, height: entry.size.h }}
      position={{ x: entry.position.x, y: entry.position.y }}
      minWidth={320}
      minHeight={240}
      dragHandleClassName="window-drag-handle"
      style={{ zIndex: entry.zIndex, pointerEvents: 'auto' }}
      onDrag={(_e, d) => updateRect(entry.id, { x: d.x, y: d.y })}
      onDragStop={(_e, d) => updateRect(entry.id, { x: d.x, y: d.y })}
      onResize={(_e, _dir, ref, _delta, position) =>
        updateRect(entry.id, position, { w: ref.offsetWidth, h: ref.offsetHeight })
      }
      onResizeStop={(_e, _dir, ref, _delta, position) =>
        updateRect(entry.id, position, { w: ref.offsetWidth, h: ref.offsetHeight })
      }
    >
      <motion.div
        className="card flex h-full w-full flex-col overflow-hidden"
        style={{ transformOrigin: entry.transformOrigin }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onMouseDownCapture={() => bringToFront(entry.id)}
      >
        <div className="window-drag-handle flex shrink-0 cursor-move items-center justify-between border-b border-border-soft px-3 py-2">
          <span className="truncate text-xs font-medium tracking-wider text-ink-soft uppercase">{entry.title}</span>
          <button
            type="button"
            onClick={() => closeWindow(entry.id)}
            aria-label={`Close ${entry.title}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-page hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {Component ? (
            <Component data={entry.data} livePrices={livePrices} />
          ) : (
            <div className="p-6 text-sm text-ink-faint">Unknown component: {entry.componentType}</div>
          )}
        </div>
      </motion.div>
    </Rnd>
  )
}
