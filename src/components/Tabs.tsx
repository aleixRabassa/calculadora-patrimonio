import { useState, useEffect, useRef } from 'react'
import './Tabs.css'

interface TabsProps {
  tabs: string[]
  active: number
  onChange: (index: number) => void
  isDark: boolean
  onToggleTheme: () => void
  onResetDefaults: () => void
  onExportJson: () => void
  onImportJson: (data: Record<string, unknown>) => void
}

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function Tabs({ tabs, active, onChange, isDark, onToggleTheme, onResetDefaults, onExportJson, onImportJson }: TabsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Record<string, unknown>
        onImportJson(data)
      } catch {
        alert('El archivo no es un JSON válido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <nav className="tabs" role="tablist">
      <div className="tabs-list">
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
      </div>

      <div className="tabs-controls">
        <button type="button" className="icon-btn" title="Cambiar tema" aria-label="Cambiar tema" onClick={onToggleTheme}>
          {isDark ? <IconSun /> : <IconMoon />}
        </button>

        <div className="settings-wrapper" ref={settingsRef}>
          <button
            type="button"
            className={`icon-btn ${menuOpen ? 'icon-btn--active' : ''}`}
            title="Configuración"
            aria-label="Configuración"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >
            <IconGear />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {menuOpen && (
            <div className="settings-menu" role="menu">
              <button
                type="button"
                className="settings-item settings-item--danger"
                role="menuitem"
                onClick={() => { onResetDefaults(); setMenuOpen(false) }}
              >
                Restaurar valores por defecto
              </button>
              <button type="button" className="settings-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                Exportar PDF
              </button>
              <button
                type="button"
                className="settings-item"
                role="menuitem"
                onClick={() => { onExportJson(); setMenuOpen(false) }}
              >
                Exportar JSON
              </button>
              <button
                type="button"
                className="settings-item"
                role="menuitem"
                onClick={() => { fileInputRef.current?.click(); setMenuOpen(false) }}
              >
                Importar JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
