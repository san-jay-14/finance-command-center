import type { ComponentType } from 'react'
import { AssetDistributionPie } from '../components/AssetDistributionPie'
import { ComparisonChart } from '../components/ComparisonChart'
import { PortfolioSummaryCard } from '../components/PortfolioSummaryCard'
import type { VizProps } from './types'

// Adding a new visualization = one entry here, not new routing logic
// (PROJECT_BRIEF.md section 6). affordability_result isn't built yet —
// that needs the affordability engine (a later build-order step).
export const componentRegistry: Record<string, ComponentType<VizProps>> = {
  portfolio_summary: PortfolioSummaryCard,
  comparison_chart: ComparisonChart,
  asset_distribution: AssetDistributionPie,
}
