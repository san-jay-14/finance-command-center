import type { LivePrices } from '../hooks/useLivePrices'

// The render_ui tool-call contract (PROJECT_BRIEF.md section 6).
export type RenderSpec = {
  component: string
  data: Record<string, unknown>
}

export type VizProps = {
  data: Record<string, unknown>
  livePrices: LivePrices
}
