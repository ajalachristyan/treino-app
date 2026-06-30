// Casca do app (Bloco C/P2.5): provider do banco + nav inferior + roteador.
import { DbProvider } from "./db/DbProvider.tsx";
import { useHashRoute, type Route } from "./router.ts";
import { TodayScreen } from "./screens/TodayScreen.tsx";
import { PlanScreen } from "./screens/PlanScreen.tsx";
import { RoutineScreen } from "./screens/RoutineScreen.tsx";
import { SessionScreen } from "./screens/SessionScreen.tsx";
import { AjustesScreen } from "./screens/AjustesScreen.tsx";

const NAV: ReadonlyArray<readonly [Route, string]> = [
  ["hoje", "Hoje"],
  ["sessao", "Treino"],
  ["plano", "Plano"],
  ["rotina", "Rotinas"],
  ["ajustes", "Ajustes"],
];

function Shell() {
  const [route, navigate] = useHashRoute();
  return (
    <div className="app">
      <main>
        {route === "hoje" && (
          <TodayScreen
            onStart={() => navigate("sessao")}
            onAjustes={() => navigate("ajustes")}
          />
        )}
        {route === "sessao" && <SessionScreen goHome={() => navigate("hoje")} />}
        {route === "plano" && <PlanScreen />}
        {route === "rotina" && <RoutineScreen />}
        {route === "ajustes" && <AjustesScreen />}
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
