import { useState, useEffect } from 'react'
import { Tabs } from './components/Tabs'
import { Ingresos } from './components/Ingresos'
import { Hipoteca } from './components/Hipoteca'
import { Inversion } from './components/Inversion'
import { Patrimonio } from './components/Patrimonio'
import { useLocalStorage } from './hooks/useLocalStorage'
import './App.css'

const TAB_LABELS = ['Ingresos', 'Hipoteca', 'Inversión', 'Patrimonio']

function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [isDark, setIsDark] = useLocalStorage('app.theme.dark', false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <>
      <header className="app-header">
        <h1>Calculadora de Patrimonio</h1>
      </header>
      <Tabs tabs={TAB_LABELS} active={activeTab} onChange={setActiveTab} isDark={isDark} onToggleTheme={() => setIsDark(v => !v)} />
      <main>
        {activeTab === 0 && <Ingresos />}
        {activeTab === 1 && <Hipoteca />}
        {activeTab === 2 && <Inversion />}
        {activeTab === 3 && <Patrimonio />}
      </main>
    </>
  )
}

export default App
