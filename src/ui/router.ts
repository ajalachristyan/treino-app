// Hash router minimo (sem dependencia). Rotas: #/hoje, #/plano, #/rotina.
import { useEffect, useState } from "react";

export const ROUTES = ["hoje", "plano", "rotina", "sessao", "ajustes"] as const;
export type Route = (typeof ROUTES)[number];

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : "hoje";
}

export function useHashRoute(): readonly [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onHash = (): void => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = (r: Route): void => {
    window.location.hash = `/${r}`;
  };
  return [route, navigate] as const;
}
