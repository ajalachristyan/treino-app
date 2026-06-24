// Casca do app (Bloco C): provider do banco + nav inferior + roteador read-only.
import { DbProvider } from "./db/DbProvider.tsx";
import { useHashRoute, type Route } from "./router.ts";
import { TodayScreen } from "./screens/TodayScreen.tsx";
import { PlanScreen } from "./screens/PlanScreen.tsx";
import { RoutineScreen } from "./screens/RoutineScreen.tsx";

const NAV: ReadonlyArray<readonly [Route, string]> = [
  ["hoje", "Hoje"],
  ["plano", "Plano"],
  ["rotina", "Rotinas"],
];

function Shell() {
  const [route, navigate] = useHashRoute();
  return (
    <div className="app">
      <main>
        {route === "hoje" && <TodayScreen />}
        {route === "plano" && <PlanScreen />}
        {route === "rotina" && <RoutineScreen />}
      </main>
      <nav className="bottomnav">
        {NAV.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="navbtn"
            aria-current={route === key ? "page" : undefined}
            onClick={() => navigate(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  return (
    <DbProvider>
      <Shell />
    </DbProvider>
  );
}
