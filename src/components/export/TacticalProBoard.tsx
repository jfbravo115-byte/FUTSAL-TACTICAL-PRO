/**
 * src/components/export/TacticalProBoard.tsx
 *
 * Página "Análisis táctico · Tactical Pro" del PDF Global del equipo.
 *
 * POR QUÉ EXISTE
 * --------------
 * El PDF Global es el documento que el entrenador entrega al cuerpo técnico.
 * Llevaba estadísticas, mapas, balón parado y contexto táctico, pero no el
 * análisis interpretativo — que es justo la parte que un entrenador lee
 * primero. Quedaba dentro de la aplicación y no salía de ella.
 *
 * SOLO LEE TEXTO YA GUARDADO
 * --------------------------
 * Recibe un fragmento de `matchData.tacticalAnalysis`, que se escribió
 * cuando el análisis terminó entero. Aquí no se pide nada, no se genera nada
 * y no se llama a ningún servicio: imprimir o reimprimir el informe no
 * provoca ni una sola petición.
 *
 * NO SE PRESENTA COMO UN HECHO
 * ----------------------------
 * El resto del PDF son datos registrados; esto es una lectura. El rótulo lo
 * dice —«análisis interpretativo»— para que nadie confunda una interpretación
 * con una medición, y para que el que lo lee sepa qué tiene delante.
 */
import React from "react";
import Markdown from "react-markdown";

export const TACTICAL_PRO_TITLE = "Análisis táctico";
export const TACTICAL_PRO_SUBTITLE = "Tactical Pro";
export const TACTICAL_PRO_CAVEAT =
  "Análisis interpretativo generado a partir de los datos registrados. No sustituye a las cifras del informe.";

/**
 * Un fragmento del análisis, ya repartido por `splitTacticalProIntoPages`.
 *
 * `chunkIndex`/`chunkCount` solo rotulan la continuidad («2/3»): la división
 * la decide quien llama, no esta plantilla. Se llaman así y no `index`/
 * `total` para no confundirse con la numeración de páginas del PDF, que es
 * otra cosa y la lleva la cabecera.
 */
export function TacticalProBoard({
  chunk,
  chunkIndex = 0,
  chunkCount = 1,
}: {
  chunk: string;
  chunkIndex?: number;
  chunkCount?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 4,
          }}
        >
          {TACTICAL_PRO_TITLE} · {TACTICAL_PRO_SUBTITLE}
          {chunkCount > 1 ? ` (${chunkIndex + 1}/${chunkCount})` : ""}
        </div>
        {/* El aviso solo en la primera página: repetirlo en cada una sería
            ruido, y omitirlo del todo dejaría la interpretación sin marcar. */}
        {chunkIndex === 0 && (
          <div style={{ fontSize: 8, color: "#94a3b8", marginBottom: 8 }}>
            {TACTICAL_PRO_CAVEAT}
          </div>
        )}
        <div style={{ borderBottom: "0.5px solid #e2e8f0" }} />
      </div>

      <div
        style={{
          fontSize: 11,
          lineHeight: 1.55,
          color: "#0f172a",
          // El PDF se captura con toJpeg: una palabra larga sin partir se
          // saldría del ancho de la página en vez de saltar de línea.
          overflowWrap: "anywhere",
        }}
      >
        <Markdown>{chunk}</Markdown>
      </div>
    </div>
  );
}

export default TacticalProBoard;
