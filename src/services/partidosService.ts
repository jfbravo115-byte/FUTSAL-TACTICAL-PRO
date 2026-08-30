/**
 * src/services/partidosService.ts
 *
 * Capa de acceso a datos para Partidos.
 * Sustituye las llamadas directas a Firestore (coleccion "partidos").
 * El resto de la app importa este modulo; no sabe si el backend es
 * Firestore o Netlify Database.
 *
 * Firebase Auth se conserva para autenticacion: obtiene el ID Token
 * y lo envia en Authorization: Bearer <token>.
 */
import { getAuth } from "firebase/auth";
import { SavedMatch, MatchData } from "../types/futsal";

const API_BASE = "/api/partidos";

async function getToken(): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");
  return user.getIdToken();
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

/** Lista los ultimos 50 partidos del usuario autenticado. */
export async function listPartidos(): Promise<SavedMatch[]> {
  const res = await apiFetch("");
  if (!res.ok) throw new Error(`listPartidos: ${res.status}`);
  return res.json();
}

/** Guarda un nuevo partido. Devuelve el id asignado por Postgres. */
export async function savePartido(data: MatchData): Promise<string> {
  const res = await apiFetch("", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`savePartido: ${res.status}`);
  const json = await res.json();
  return json.id;
}

/** Obtiene un partido por id. */
export async function getPartido(id: string): Promise<SavedMatch> {
  const res = await apiFetch(`/${id}`);
  if (!res.ok) throw new Error(`getPartido: ${res.status}`);
  return res.json();
}

/** Elimina uno o varios partidos. */
export async function deletePartidos(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      const res = await apiFetch(`/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`deletePartido ${id}: ${res.status}`);
    })
  );
}
