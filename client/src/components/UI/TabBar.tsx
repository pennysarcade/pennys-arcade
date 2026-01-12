import { ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
}

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  variant?: 'header' | 'sidebar'
}

export default function TabBar({ tabs, activeTab, onTabChange, variant = 'header' }: TabBarProps) {
  const containerClass = variant === 'header' ? 'tab-bar-header' : 'tab-bar-sidebar'
  const tabClass = variant === 'header' ? 'tab-header' : 'tab-sidebar'

  return (
    <div className={containerClass}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`${tabClass}${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
