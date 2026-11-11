import { ExplainProvider } from '../lib/explain'
import { CenterTab, SheetTab } from './calc/ShopTabs'

// Shop lookups on their own page: open Tap drills and get tap drills, without the motor
// calculator's team robot and tabs around them. The same tools stay as Calculator tabs too.

const TOOLS = {
  sheet: { title: 'Tap drills', body: <SheetTab /> },
  center: { title: 'Center distance', body: <CenterTab /> },
}

export default function ShopTool({ which }: { which: keyof typeof TOOLS }) {
  const tool = TOOLS[which]
  return (
    <ExplainProvider>
      <div className="page page--wide">
        <div className="page__head">
          <h1 className="page__title">{tool.title}</h1>
        </div>
        {tool.body}
      </div>
    </ExplainProvider>
  )
}
