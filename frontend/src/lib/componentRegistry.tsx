import type { ComponentType } from 'react'
import { ActivityHistoryCard } from '../components/ActivityHistoryCard'
import { AffordabilityResultCard } from '../components/AffordabilityResultCard'
import { AssetDistributionPie } from '../components/AssetDistributionPie'
import { BacktestResultCard } from '../components/BacktestResultCard'
import { CandlestickChart } from '../components/CandlestickChart'
import { ComparisonChart } from '../components/ComparisonChart'
import { PortfolioSummaryCard } from '../components/PortfolioSummaryCard'
import type { VizProps } from './types'

// Adding a new visualization = one entry here, not new routing logic
// (PROJECT_BRIEF.md section 6).
export const componentRegistry: Record<string, ComponentType<VizProps>> = {
  portfolio_summary: PortfolioSummaryCard,
  comparison_chart: ComparisonChart,
  asset_distribution: AssetDistributionPie,
  affordability_result: AffordabilityResultCard,
  backtest_result: BacktestResultCard,
  candlestick_chart: CandlestickChart,
  activity_history: ActivityHistoryCard,
}
