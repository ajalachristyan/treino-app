// Hash router minimo (sem dependencia). Abas fixas + tela de detalhe de
// exercicio (#/exercicio/<id>), que vem de varias origens e volta com
// history.back().
import { useEffect, useState } from "react";

export const ROUTES = [
  "hoje",
  "sessao",
  "plano",
  "rotina",
  "exercicios",
  "ajustes",
  "editar",
  "historico",
] as const;
export type Route = (typeof ROUTES)[number];

// Localizacao parseada do hash: uma aba, ou o detalhe de um exercicio.
export type Location =
  | { readonly name: Route }
  | { readonly name: "exercicio"; readonly id: string };

function parseHash(): Location {
  const h = window.location.hash.replace(/^#\/?/, "");
  const slash = h.indexOf("/");
  const head = slash === -1 ? h : h.slice(0, slash);
  const rest = slash === -1 ? "" : h.slice(slash + 1);
  if (head === "exercicio" && rest !== "") {
    return { name: "exercicio", id: decodeURIComponent(rest) };
  }
  return {
    name: (ROUTES as readonly string[]).includes(head) ? (head as Route) : "hoje",
  };
}

export interface Nav {
  readonly loc: Location;
  readonly navigate: (r: Route) => void;
  readonly openExercise: (exerciseId: string) => void;
  readonly back: () => void;
}

export function useHashRoute(): Nav {
  const [loc, setLoc] = useState<Location>(parseHash);
  useEffect(() => {
    const onHash = (): void => setLoc(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return {
    loc,
    navigate: (r) => {
      window.location.hash = `/${r}`;
    },
    openExercise: (exerciseId) => {
      window.location.hash = `/exercicio/${encodeURIComponent(exerciseId)}`;
    },
    // Volta para a origem (Hoje/Plano/Rotinas/Exercicios) — o detalhe vem de
    // varias telas, entao usamos o historico em vez de uma origem fixa.
    back: () => window.history.back(),
  };
}
