import { componentRegistry } from '../lib/componentRegistry'
import type { LivePrices } from '../hooks/useLivePrices'
import type { RenderSpec } from '../lib/types'

export function Canvas({ spec, livePrices }: { spec: RenderSpec | null; livePrices: LivePrices }) {
  if (!spec) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-neutral-400">
        Ask something like "show my portfolio summary" to see it here.
      </div>
    )
  }

  const Component = componentRegistry[spec.component]
  if (!Component) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-neutral-400">
        I don't have a visualization for that yet.
      </div>
    )
  }

  return (
    <div className="h-full min-h-[24rem]">
      <Component data={spec.data} livePrices={livePrices} />
    </div>
  )
}
