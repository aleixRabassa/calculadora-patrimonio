import './Tabs.css'

interface TabsProps {
  tabs: string[]
  active: number
  onChange: (index: number) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={i === active}
          className={`tab ${i === active ? 'tab--active' : ''}`}
          onClick={() => onChange(i)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
