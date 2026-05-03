import { useState, useEffect } from 'react'

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (!stored) return defaultValue
      const parsed = JSON.parse(stored) as T
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
          defaultValue !== null && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
        return { ...defaultValue, ...parsed }
      }
      return parsed
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage full or unavailable — silently ignore
    }
  }, [key, value])

  return [value, setValue]
}
