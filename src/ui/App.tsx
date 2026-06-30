// Casca do app (Bloco C/P2.5/Bloco 2): provider do banco + nav inferior +
// roteador (abas + detalhe de exercicio).
import { DbProvider } from "./db/DbProvider.tsx";
import { useHashRoute, type Route } from "./router.ts";
import { TodayScreen } from "./screens/TodayScreen.tsx";
import { PlanScreen } from "./screens/PlanScreen.tsx";
import { RoutineScreen } from "./screens/RoutineScreen.tsx";
import { SessionScreen } from "./screens/SessionScreen.tsx";
import { AjustesScreen } from "./screens/AjustesScreen.tsx";
import { ExerciseLibraryScreen } from "./screens/ExerciseLibraryScreen.tsx";
import { ExerciseDetailScreen } from "./screens/ExerciseDetailScreen.tsx";
import { PlanEditorScreen } from "./screens/PlanEditorScreen.tsx";

const NAV: ReadonlyArray<readonly [Route, string]> = [
  ["hoje", "Hoje"],
  ["sessao", "Treino"],
  ["plano", "Plano"],
  ["rotina", "Rotinas"],
  ["exercicios", "Exercícios"],
  ["ajustes", "Ajustes"],
];

function Shell() {
  const { loc, navigate, openExercise, back } = useHashRoute();
  // Nenhuma aba fica marcada quando se ve o detalhe de um exercicio.
  const activeTab = loc.name === "exercicio" ? null : loc.name;

  return (
    <div className="app">
      <main>
        {loc.name === "hoje" && (
          <TodayScreen
            onStart={() => navigate("sessao")}
            onAjustes={() => navigate("ajustes")}
            onOpenExercise={openExercise}
          />
        )}
        {loc.name === "sessao" && <SessionScreen goHome={() => navigate("hoje")} />}
        {loc.name === "plano" && (
          <PlanScreen
            onOpenExercise={openExercise}
            onEdit={() => navigate("editar")}
          />
        )}
        {loc.name === "rotina" && <RoutineScreen onOpenExercise={openExercise} />}
        {loc.name === "editar" && (
          <PlanEditorScreen onDone={() => navigate("plano")} />
        )}
        {loc.name === "exercicios" && (
          <ExerciseLibraryScreen onOpenExercise={openExercise} />
        )}
        {loc.name === "ajustes" && <AjustesScreen />}
        {loc.name === "exercicio" && (
          <ExerciseDetailScreen id={loc.id} onBack={back} />
        )}
      </main>
      <nav className="bottomnav">
        {NAV.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="navbtn"
            aria-current={activeTab === key ? "page" : undefined}
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
