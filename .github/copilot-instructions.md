# Copilot Instructions

## Project

React 19 + TypeScript + Vite 8 SPA — calculadora de hipoteca, inversión y patrimonio neto. Sin backend ni base de datos; toda la persistencia es vía `localStorage`.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173 (HMR)
npm run build      # tsc -b && vite build → dist/
npm run lint       # eslint on all .ts/.tsx files
npm run preview    # preview the production build locally

# Docker (production, served by nginx on port 8080)
docker-compose up --build
```

No test framework is configured. Do not add tests unless explicitly requested.

## Architecture

```
src/
  hooks/          # Reusable hooks (no components here)
  App.tsx         # Root component
  main.tsx        # ReactDOM entry point, wraps App in StrictMode
```

All user state is persisted via the `useLocalStorage` hook. There is no global store — each calculator section owns its own localStorage key.

### useLocalStorage hook

`src/hooks/useLocalStorage.ts` — generic hook that initializes state from localStorage and syncs back on every change. Use it instead of plain `useState` for any data that should survive a page reload:

```ts
const [hipoteca, setHipoteca] = useLocalStorage('hipoteca', { precio: 0, interes: 0 })
```

Keys should be stable, namespaced strings (e.g. `'calc.hipoteca'`, `'calc.inversion'`).

## Design Philosophy

**Eficiente, simple y muy visual** — menos es más, pero cada elemento debe comunicar algo de valor.

- **Visual primero**: usar gráficas, indicadores y resúmenes visuales antes que tablas de números. Los resultados deben impactar a primera vista.
- **Interactividad inmediata**: los cálculos se recalculan en tiempo real mientras el usuario escribe (no hay botón "Calcular").
- **Cero dependencias innecesarias**: antes de añadir una librería evaluar si se puede resolver con CSS + JS nativo. Si se necesita una librería de gráficos, añadir solo una (e.g. Recharts).
- **Sin over-engineering**: no añadir contextos globales, reducers ni state managers hasta que haya un caso concreto que lo justifique. `useLocalStorage` es suficiente por ahora.
- **Componentes pequeños y enfocados**: cada componente hace una sola cosa. Los formularios de entrada van separados de los paneles de resultados.

## Key Conventions

- **`verbatimModuleSyntax` is enabled** — use `import type` for type-only imports.
- **`noUnusedLocals` / `noUnusedParameters` are errors** — clean up unused symbols immediately.
- **`erasableSyntaxOnly`** — avoid TypeScript syntax that can't be stripped (e.g. `const enum`, namespaces with runtime code).
- CSS is colocated: each component has a `.css` file beside it (e.g. `App.css` next to `App.tsx`). No CSS-in-JS.
- New hooks go in `src/hooks/`. Components will go in `src/components/` when created.
- The ESLint config enforces `react-hooks` rules (exhaustive deps). Don't disable them.
