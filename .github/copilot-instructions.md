# Copilot Instructions

## Project

React 19 + TypeScript + Vite 8 SPA — calculadora de hipoteca, inversión y patrimonio neto. Sin backend ni base de datos; toda la persistencia es vía `localStorage`.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173 (HMR)
npm run build      # tsc -b && vite build → dist/
npm run lint       # eslint on all .ts/.tsx files
npm run preview    # preview the production build locally
npm run test       # run all tests once (Vitest)
npm run test:watch # run tests in watch mode

# Docker (production, served by nginx on port 8080)
docker-compose up --build
```

Tests use **Vitest** (Vite-native, Jest-compatible API). Import explicitly from `'vitest'` — do not rely on globals. Pure calculation tests use `environment: 'node'`; component tests will need `environment: 'jsdom'` (set per-file with `@vitest-environment jsdom` if needed). Test files live alongside the code they test (`*.test.ts` / `*.test.tsx`).

## Architecture

```
src/
  hooks/          # Reusable hooks (no components here)
  utils/
    calculations.ts       # ALL financial calculation logic (pure functions, no React)
    calculations.test.ts  # ALL calculation tests (Vitest)
  App.tsx         # Root component
  main.tsx        # ReactDOM entry point, wraps App in StrictMode
```

All financial logic (hipoteca, inversión, patrimonio neto) must live in `src/utils/calculations.ts` as pure functions. No calculation logic in components or hooks — components call these functions and display results. Every function in `calculations.ts` must have corresponding tests in `calculations.test.ts`. **Tests are only for calculation logic — do not write tests for components, hooks, or any other code.**

All user state is persisted via the `useLocalStorage` hook. There is no global store — each calculator section owns its own localStorage key.

### useLocalStorage hook

`src/hooks/useLocalStorage.ts` — generic hook that initializes state from localStorage and syncs back on every change. Use it instead of plain `useState` for any data that should survive a page reload:

```ts
const [hipoteca, setHipoteca] = useLocalStorage('hipoteca', { precio: 0, interes: 0 })
```

Keys should be stable, namespaced strings (e.g. `'calc.hipoteca'`, `'calc.inversion'`).

## Project Skills

The following skills are installed under `.agents/skills/` and must be followed:

| Skill | Scope |
|---|---|
| `jest-react-testing` | Writing and configuring React/hook/utility tests |
| `accelint-react-testing` | React testing best practices (query priority, userEvent, no implementation details) |
| `vercel-react-best-practices` | React performance and rendering patterns |
| `vercel-react-view-transitions` | View Transition API for animations and page transitions |
| `frontend-design` | UI component quality and design standards |

## Design Philosophy

**Eficiente, simple y muy visual** — menos es más, pero cada elemento debe comunicar algo de valor.

- **Visual primero**: usar gráficas, indicadores y resúmenes visuales antes que tablas de números. Los resultados deben impactar a primera vista.
- **Interactividad inmediata**: los cálculos se recalculan en tiempo real mientras el usuario escribe (no hay botón "Calcular").
- **Cero dependencias innecesarias**: antes de añadir una librería evaluar si se puede resolver con CSS + JS nativo. Si se necesita una librería de gráficos, añadir solo una (e.g. Recharts).
- **Sin over-engineering**: no añadir contextos globales, reducers ni state managers hasta que haya un caso concreto que lo justifique. `useLocalStorage` es suficiente por ahora.
- **Componentes pequeños y enfocados**: cada componente hace una sola cosa. Los formularios de entrada van separados de los paneles de resultados.

## Workflow

Antes de implementar cualquier tarea no trivial:

1. **Brainstorming obligatorio**: proponer al usuario al menos 2-3 enfoques diferentes que encajen con lo que pide, explicando pros y contras de cada uno.
2. **Preguntar lo que no esté claro**: si hay ambigüedad en el alcance, el comportamiento esperado o los casos borde, preguntar antes de asumir.
3. **Dejar que el usuario elija**: no avanzar con la implementación hasta que el usuario confirme el enfoque preferido.

## Key Conventions

- **All code must be in English** — variable names, function names, component names, file names, CSS class names, TypeScript types/interfaces, comments, and any other identifier. The UI text shown to the user may be in Spanish, but all code identifiers must be English.
- **`verbatimModuleSyntax` is enabled** — use `import type` for type-only imports.
- **`noUnusedLocals` / `noUnusedParameters` are errors** — clean up unused symbols immediately.
- **`erasableSyntaxOnly`** — avoid TypeScript syntax that can't be stripped (e.g. `const enum`, namespaces with runtime code).
- CSS is colocated: each component has a `.css` file beside it (e.g. `App.css` next to `App.tsx`). No CSS-in-JS.
- New hooks go in `src/hooks/`. Components will go in `src/components/` when created.
- The ESLint config enforces `react-hooks` rules (exhaustive deps). Don't disable them.

## Important Rules

- **NEVER make git commits**. Never use `git commit`, `git push`, or any other git commands that modify the repository. The user is responsible for all git operations.
