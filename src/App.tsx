import { useEffect, useRef } from 'react'
import { Tabs } from './components/Tabs'
import { Ingresos } from './components/Ingresos'
import { Hipoteca } from './components/Hipoteca'
import { Inversion } from './components/Inversion'
import { Patrimonio } from './components/Patrimonio'
import { useLocalStorage } from './hooks/useLocalStorage'
import './App.css'

const TAB_LABELS = ['Ingresos', 'Hipoteca', 'Inversión', 'Patrimonio']

const STORAGE_KEYS = [
  'app.activeTab',
  'app.theme.dark',
  'calc.ingresos',
  'calc.ingresos.fechaObjetivo',
  'calc.ingresos.ahorroObjetivo',
  'calc.hipoteca',
  'calc.inversion',
]

const CALC_KEYS = STORAGE_KEYS.filter(k => k.startsWith('calc.'))

function App() {
  const [activeTab, setActiveTab] = useLocalStorage('app.activeTab', 0)
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const [isDark, setIsDark] = useLocalStorage('app.theme.dark', systemDark)
  const isImporting = useRef(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  function handleResetDefaults() {
    if (!window.confirm('¿Seguro que quieres restaurar todos los valores por defecto? Se perderán todos los datos introducidos.')) return
    CALC_KEYS.forEach(key => localStorage.removeItem(key))
    localStorage.removeItem('app.activeTab')
    window.location.reload()
  }

  function handleExportJson() {
    const data: Record<string, unknown> = {}
    STORAGE_KEYS.forEach(key => {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        try { data[key] = JSON.parse(raw) } catch { data[key] = raw }
      }
    })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'calculadora-patrimonio.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportJson(data: Record<string, unknown>) {
    if (isImporting.current) return
    isImporting.current = true
    Object.entries(data).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value))
    })
    window.location.reload()
  }

  return (
    <>
      <header className="app-header">
        <h1>Calculadora de Patrimonio</h1>
      </header>
      <Tabs
        tabs={TAB_LABELS}
        active={activeTab}
        onChange={setActiveTab}
        isDark={isDark}
        onToggleTheme={() => setIsDark(v => !v)}
        onResetDefaults={handleResetDefaults}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
      />
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
