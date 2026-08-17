"""
video_analyzer.py — Futsal Commander Pro · Módulo de Scouting (Fase 1)
=======================================================================
Analiza un vídeo COMPLETO de partido (offline, no en vivo) y genera un
JSON de análisis con:

  1. TRACKS       Posiciones de cada jugador (id estable) muestreadas a ~5/s,
                  en coordenadas de pista en metros si se dan las 4 esquinas.
  2. EQUIPOS      Clasificación local/rival por color de equipación (torso).
  3. EVENTOS      Parones y reanudaciones del juego, clasificados por zona:
                    - saque_centro            (círculo central; posible tras gol)
                    - saque_esquina           (una de las 4 esquinas)
                    - saque_banda_baja/media/alta (tercios del lateral)
                    - reanudacion_otra        (no clasificable por zona)
  4. SUPERIORIDAD Ventanas sostenidas de 5v4 / 4v5 y candidatos a
                  portero-jugador (5 de campo sin nadie en el área propia).
  5. HEATMAPS     Rejilla 20x10 de ocupación por equipo y por jugador.
  6. FORMACIONES  Instantáneas periódicas de estructura (centroide, anchura,
                  profundidad y reparto por líneas) de cada equipo.

Uso (en la instancia Vast.ai, mismo entorno que yolo_server.py):

  python video_analyzer.py partido.mp4 \
      --output analisis_partido.json \
      --local blue --rival red \
      --corners "120,80;1800,95;1850,1020;90,1000"

  --corners: 4 esquinas de la pista EN PÍXELES DEL VÍDEO, en orden:
             arriba-izq; arriba-der; abajo-der; abajo-izq.
             Si se omite, las posiciones se dan normalizadas 0-100 sobre el
             frame (menos precisas, sin corrección de perspectiva).

El JSON resultante lo consume la pantalla "Análisis de Vídeo" de la app
(Fase 2). Diseñado para partidos de ~40-60 min: el tamaño típico del JSON
queda entre 5 y 20 MB.
"""

import argparse
import json
import math
import sys
import time
from collections import defaultdict, deque

import cv2
import numpy as np
from ultralytics import YOLO


# ── Clasificador v10: por cercania de color (espacio LAB) ────────────────────
def medir_referencias_lab(video_path, t_s, muestras_str):
    """muestras_str: 'local:x,y;local:x,y;rival:x,y;gklocal:x,y;gkrival:x,y'
    Mide el color LAB mediano de cada camiseta en el frame indicado."""
    puntos = {}
    for item in muestras_str.split(";"):
        name, xy = item.split(":")
        x, y = xy.split(",")
        puntos.setdefault(name.strip(), []).append((int(float(x)), int(float(y))))
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, t_s * 1000)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("ERROR: no se pudo leer el frame de muestras")
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    alias = {"local": "local", "rival": "rival",
             "gklocal": "gk_local", "gkrival": "gk_rival"}
    refs = {}
    R = 10
    for name, pts in puntos.items():
        vals = []
        for (x, y) in pts:
            vals.append(lab[max(0, y - R):y + R, max(0, x - R):x + R].reshape(-1, 3))
        v = np.concatenate(vals)
        refs[alias.get(name, name)] = np.median(v, axis=0)
    return refs


def classify_team_lab(frame_bgr, x1, y1, x2, y2, refs, max_dist=45.0):
    """Asigna el equipo cuya referencia LAB este mas cerca del torso.
    El brillo (L) pesa la mitad para tolerar sombras y focos."""
    h, w = frame_bgr.shape[:2]
    x1, y1 = max(0, int(x1)), max(0, int(y1))
    x2, y2 = min(w, int(x2)), min(h, int(y2))
    if x2 <= x1 or y2 <= y1:
        return "desconocido"
    bh, bw = y2 - y1, x2 - x1
    region = frame_bgr[y1 + int(bh * 0.18): y1 + int(bh * 0.50),
                       x1 + int(bw * 0.25): x2 - int(bw * 0.25)]
    if region.size == 0:
        return "desconocido"
    lab = cv2.cvtColor(region, cv2.COLOR_BGR2LAB).astype(np.float32)
    med = np.median(lab.reshape(-1, 3), axis=0)
    best, bestd = "desconocido", max_dist
    for name, ref in refs.items():
        dl = (med[0] - ref[0]) * 0.5
        da = med[1] - ref[1]
        db = med[2] - ref[2]
        d = (dl * dl + da * da + db * db) ** 0.5
        if d < bestd:
            bestd, best = d, name
    return best


# ── Configuración ─────────────────────────────────────────────────────────────
CFG = {
    "model_path": "yolov8s.pt",     # offline: podemos permitirnos el modelo "s"
    "conf_threshold": 0.35,
    "person_class_id": 0,
    "device": 0,

    # Muestreo
    "detect_every_n": 2,            # procesar 1 de cada N frames (2 = ~12-15 fps efectivos)
    "store_hz": 5,                  # posiciones guardadas en el JSON por segundo

    # Pista fútbol sala (metros). Eje X = largo (40 m), eje Y = ancho (20 m)
    "pitch_len_m": 40.0,
    "pitch_wid_m": 20.0,

    # Detección de parones/reanudaciones
    "stop_speed_thresh": 1.5,      # m/s medios del conjunto para considerar "parado"
    "stop_min_sec": 1.0,            # duración mínima del parón
    "restart_speed_thresh": 2.0,    # m/s medios para considerar "reanudado"

    # Zonas (en metros, sobre pista 40x20)
    "corner_radius_m": 5.5,         # distancia a esquina para "saque de esquina"
    "sideline_band_m": 2.0,         # distancia a banda para "saque de banda"
    "center_radius_m": 4.0,         # distancia al centro para "saque de centro"

    # Superioridad
    "superiority_min_sec": 5.0,     # duración mínima sostenida
    "own_area_len_m": 7.0,          # profundidad del "área propia" para portero-jugador

    # Heatmap
    "grid_x": 20,                   # celdas a lo largo (2 m/celda)
    "grid_y": 10,
    "max_foot_y": None,                   # celdas a lo ancho (2 m/celda)
}

COLOR_HSV_MAP = {
    "blue":   {"h": (90, 130),  "s": (60, 255),  "v": (40, 255)},
    "red":    {"h": (0, 20),    "s": (60, 255),  "v": (40, 255)},
    "white":  {"h": (0, 360), "s": (0, 70), "v": (70, 255)},
    "black":  {"h": (0, 360), "s": (0, 255), "v": (0, 95)},
    "yellow": {"h": (20, 80),  "s": (75, 255), "v": (70, 255)},
    "green":  {"h": (40, 80),   "s": (60, 255),  "v": (40, 255)},
    "orange": {"h": (5, 25),    "s": (150, 255), "v": (100, 255)},
    "purple": {"h": (130, 160), "s": (60, 255),  "v": (40, 255)},
    "pink":   {"h": (300, 350), "s": (60, 255), "v": (120, 255)},
    "cyan":   {"h": (80, 100),  "s": (60, 255),  "v": (60, 255)},
}


# ── Utilidades ────────────────────────────────────────────────────────────────
def classify_team(frame_bgr, x1, y1, x2, y2, team_colors):
    """Equipo según color dominante del torso (misma lógica que yolo_server)."""
    h, w = frame_bgr.shape[:2]
    x1, y1 = max(0, int(x1)), max(0, int(y1))
    x2, y2 = min(w, int(x2)), min(h, int(y2))
    if x2 <= x1 or y2 <= y1:
        return "desconocido"
    bh = y2 - y1
    region = frame_bgr[y1 + int(bh * 0.15): y1 + int(bh * 0.55), x1:x2]
    if region.size == 0:
        return "desconocido"
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    best_team, best_ratio = "desconocido", 0.22
    for team_name, ranges in team_colors.items():
        lower = np.array([ranges["h"][0] // 2, ranges["s"][0], ranges["v"][0]])
        upper = np.array([ranges["h"][1] // 2, ranges["s"][1], ranges["v"][1]])
        mask = cv2.inRange(hsv, lower, upper)
        ratio = mask.sum() / 255 / (region.shape[0] * region.shape[1] + 1e-5)
        if ratio > best_ratio:
            best_ratio, best_team = ratio, team_name
    return best_team


def build_homography(corners_px, pitch_len_m, pitch_wid_m):
    """Homografía píxeles→metros. corners_px: [(x,y)×4] TL,TR,BR,BL."""
    src = np.array(corners_px, dtype=np.float32)
    dst = np.array([
        [0, 0],
        [pitch_len_m, 0],
        [pitch_len_m, pitch_wid_m],
        [0, pitch_wid_m],
    ], dtype=np.float32)
    H, _ = cv2.findHomography(src, dst)
    return H


def px_to_court(H, x_px, y_px):
    """Proyecta un punto de píxeles a metros de pista con la homografía."""
    pt = np.array([[[x_px, y_px]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H)[0][0]
    return float(out[0]), float(out[1])


def classify_restart_zone(cx, cy, cfg, in_meters):
    """
    Clasifica una reanudación según la posición del cluster de jugadores.
    Devuelve (tipo, detalle). Coordenadas en metros (o 0-100 si no hay
    homografía; en ese caso se escalan los umbrales proporcionalmente).
    """
    if in_meters:
        L, W = cfg["pitch_len_m"], cfg["pitch_wid_m"]
        corner_r, band, center_r = cfg["corner_radius_m"], cfg["sideline_band_m"], cfg["center_radius_m"]
    else:
        L, W = 100.0, 100.0
        corner_r, band, center_r = 8.0, 6.0, 10.0

    # Saque de centro
    if math.hypot(cx - L / 2, cy - W / 2) <= center_r:
        return "saque_centro", "circulo_central"

    # Esquinas
    corners = [(0, 0, "arriba_izq"), (L, 0, "arriba_der"),
               (L, W, "abajo_der"), (0, W, "abajo_izq")]
    for ex, ey, name in corners:
        if math.hypot(cx - ex, cy - ey) <= corner_r:
            return "saque_esquina", name

    # Bandas (laterales largos: y≈0 o y≈W). Altura por tercios del largo.
    # Saque de porteria: cluster junto a una de las dos porterias
    gz = 6.0 if in_meters else 15.0
    if cx <= gz:
        return "saque_porteria", "fondo_izquierdo"
    if cx >= L - gz:
        return "saque_porteria", "fondo_derecho"

    if cy <= band or cy >= W - band:
        third = L / 3.0
        if cx <= third:
            altura = "baja"
        elif cx <= 2 * third:
            altura = "media"
        else:
            altura = "alta"
        lado = "banda_superior" if cy <= band else "banda_inferior"
        return f"saque_banda_{altura}", lado

    return "reanudacion_otra", "campo_abierto"


# ── Analizador principal ──────────────────────────────────────────────────────
class VideoAnalyzer:
    def __init__(self, cfg, team_colors, homography=None, corners_px=None):
        self.cfg = cfg
        self.team_colors = team_colors
        self.refs = None  # referencias LAB (clasificador v10)
        self.H = homography
        self.corners_px = corners_px  # esquinas originales en pixeles (para invertir H en el visor)
        self.model = YOLO(cfg["model_path"])

        self.in_meters = homography is not None
        # Persistencia de equipo por track_id (voto mayoritario acumulado)
        self.team_votes = defaultdict(lambda: defaultdict(int))
        # Última posición conocida por track para velocidades
        self.last_pos = {}
        self.last_t = {}

        # Salidas
        self.samples = []           # posiciones muestreadas
        self.events = []            # parones/reanudaciones/superioridad
        self.heat_team = {"local": None, "rival": None}
        self.heat_player = defaultdict(lambda: self._empty_grid())
        self.formations = []        # instantáneas periódicas

        for k in self.heat_team:
            self.heat_team[k] = self._empty_grid()

        # Estado de detección de parones
        self.speed_window = deque(maxlen=15)   # ventana de velocidad media
        self.stopped_since = None
        self.in_stop = False

        # Estado de superioridad
        self.sup_state = None       # "local" | "rival" | None
        self.sup_since = None

        # Kickoffs vistos (para marcar "posible tras gol")
        self.kickoff_count_half = 0

    def _empty_grid(self):
        return [[0] * self.cfg["grid_x"] for _ in range(self.cfg["grid_y"])]

    def _grid_cell(self, x, y):
        if self.in_meters:
            L, W = self.cfg["pitch_len_m"], self.cfg["pitch_wid_m"]
        else:
            L, W = 100.0, 100.0
        gx = min(self.cfg["grid_x"] - 1, max(0, int(x / L * self.cfg["grid_x"])))
        gy = min(self.cfg["grid_y"] - 1, max(0, int(y / W * self.cfg["grid_y"])))
        return gx, gy

    # ── Proceso frame a frame ────────────────────────────────────────────
    def process(self, video_path, output_path, progress_every_sec=30, start_s=0.0, end_s=None):
        self.start_s = start_s
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"ERROR: no se pudo abrir {video_path}", file=sys.stderr)
            sys.exit(1)

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        vw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        n_every = self.cfg["detect_every_n"]
        store_every_sec = 1.0 / self.cfg["store_hz"]

        print(f"Vídeo: {vw}x{vh} @ {fps:.1f} fps, {total} frames "
              f"({total / fps / 60:.1f} min). Homografía: {'SÍ' if self.in_meters else 'NO'}")

        frame_idx = 0
        last_store_t = -1e9
        last_formation_t = -1e9
        t0 = time.time()

        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1
            if frame_idx % n_every != 0:
                continue

            t_video = frame_idx / fps  # segundos de video
            if t_video < start_s:
                continue
            if end_s is not None and t_video > end_s:
                break

            results = self.model.track(
                frame, persist=True, verbose=False,
                conf=self.cfg["conf_threshold"],
                classes=[self.cfg["person_class_id"]],
                device=self.cfg["device"],
                tracker="bytetrack.yaml",
            )

            tracks = self._extract_tracks(results, frame, t_video)
            self._update_speeds(tracks, t_video)
            self._detect_stoppage(tracks, t_video)
            self._detect_superiority(tracks, t_video)

            # Muestrear posiciones para el JSON
            if t_video - last_store_t >= store_every_sec:
                last_store_t = t_video
                self._store_sample(tracks, t_video)

            # Instantánea de formación cada 5 s
            if t_video - last_formation_t >= 5.0:
                last_formation_t = t_video
                self._store_formation(tracks, t_video)

            if frame_idx % int(fps * progress_every_sec) < n_every:
                pct = frame_idx / max(total, 1) * 100
                elapsed = time.time() - t0
                print(f"  {pct:5.1f}%  t={t_video/60:6.2f} min  "
                      f"tracks={len(tracks)}  ({elapsed:.0f}s procesando)")

        cap.release()
        self._close_open_events(frame_idx / fps)
        self._write_output(output_path, video_path, fps, vw, vh, frame_idx / fps)
        print(f"Hecho en {(time.time()-t0)/60:.1f} min → {output_path}")

    def _extract_tracks(self, results, frame, t_video):
        tracks = []
        r = results[0]
        if r.boxes is None or r.boxes.id is None:
            return tracks
        boxes = r.boxes.xyxy.cpu().numpy()
        ids = r.boxes.id.cpu().numpy().astype(int)
        for (x1, y1, x2, y2), tid in zip(boxes, ids):
            # Punto pie: centro-x, borde inferior del bbox (contacto con suelo)
            foot_x = (x1 + x2) / 2.0
            foot_y = y2
            if self.cfg.get("max_foot_y") and foot_y > self.cfg["max_foot_y"]:
                continue  # gradas / publico por debajo de la linea de corte
            if self.in_meters:
                cx, cy = px_to_court(self.H, foot_x, foot_y)
                # Descartar detecciones claramente fuera de pista (gradas, banquillos)
                L, W = self.cfg["pitch_len_m"], self.cfg["pitch_wid_m"]
                ROI_MARGIN_M = 0.5  # ROI v1 validado: antes 4.0
                if not (-ROI_MARGIN_M <= cx <= L + ROI_MARGIN_M and -ROI_MARGIN_M <= cy <= W + ROI_MARGIN_M):
                    continue
                en_borde = cx < 0.0 or cx > L or cy < 0.0 or cy > W
                cx = min(max(cx, 0.0), L)
                cy = min(max(cy, 0.0), W)
            else:
                en_borde = False
                h, w = frame.shape[:2]
                cx = foot_x / w * 100.0
                cy = foot_y / h * 100.0

            if self.refs is not None:
                team = classify_team_lab(frame, x1, y1, x2, y2, self.refs)
            else:
                team = classify_team(frame, x1, y1, x2, y2, self.team_colors)
            if team != "desconocido":
                self.team_votes[tid][team] += 1
            # Equipo estable = voto mayoritario histórico del track
            votes = self.team_votes[tid]
            stable_team = max(votes, key=votes.get) if votes else "desconocido"
            is_gk = stable_team in ("gk_local", "gk_rival")
            if is_gk:
                base_team = "local" if stable_team == "gk_local" else "rival"
                if not hasattr(self, "gk_xs"):
                    self.gk_xs = {"local": [], "rival": []}
                self.gk_xs[base_team].append(cx)
                stable_team = base_team

            track_dict = {"id": int(tid), "x": cx, "y": cy, "team": stable_team, "gk": is_gk}
            if en_borde:
                track_dict["borde"] = True
            tracks.append(track_dict)

            gx, gy = self._grid_cell(cx, cy)
            if stable_team in self.heat_team:
                self.heat_team[stable_team][gy][gx] += 1
            self.heat_player[int(tid)][gy][gx] += 1
        return tracks

    def _update_speeds(self, tracks, t):
        # Velocidad medida sobre ~0.6 s (no frame a frame) para ignorar el
        # temblor de las cajas de deteccion, y mediana (robusta a outliers).
        if not hasattr(self, "pos_hist"):
            self.pos_hist = defaultdict(lambda: deque(maxlen=40))
        speeds = []
        for tr in tracks:
            if tr.get("team") not in ("local", "rival"):
                continue
            tid = tr["id"]
            hist = self.pos_hist[tid]
            hist.append((t, tr["x"], tr["y"]))
            ref = None
            for (t0, x0, y0) in hist:
                if t - t0 >= 0.6:
                    ref = (t0, x0, y0)
                else:
                    break
            if ref is not None:
                dt = t - ref[0]
                if dt > 0:
                    d = math.hypot(tr["x"] - ref[1], tr["y"] - ref[2])
                    speeds.append(d / dt)
        med_speed = float(np.median(speeds)) if speeds else 0.0
        self.speed_window.append((t, med_speed))

    def _detect_stoppage(self, tracks, t):
        if len(self.speed_window) < 5:
            return
        recent = [s for (_, s) in list(self.speed_window)[-8:]]
        avg = float(np.mean(recent))
        # Sin homografia las coordenadas son %: escala ~2.5 unidades por metro
        if not self.in_meters:
            avg = avg / 2.5

        if not self.in_stop:
            if avg < self.cfg["stop_speed_thresh"]:
                if self.stopped_since is None:
                    self.stopped_since = t
                elif t - self.stopped_since >= self.cfg["stop_min_sec"]:
                    self.in_stop = True
                    # Guardar posiciones DURANTE el paron: la zona del saque
                    # se clasifica por donde se agrupan, no por donde estan
                    # al reanudarse ya desplegados
                    self.stop_snapshot = [dict(tr) for tr in tracks]
            else:
                self.stopped_since = None
        else:
            if avg > self.cfg["restart_speed_thresh"]:
                # REANUDACIÓN: clasificar por dónde está el cluster de jugadores
                self._register_restart(tracks, t)
                self.in_stop = False
                self.stopped_since = None

    def _register_restart(self, tracks, t):
        snap = getattr(self, "stop_snapshot", None)
        if snap:
            tracks = snap
            self.stop_snapshot = None
        if not tracks:
            return
        # Punto de MAYOR CONCENTRACION de jugadores (no mediana global):
        # en un saque los jugadores se agolpan cerca del balon
        radio = 7.0 if self.in_meters else 18.0
        best_n, best_pt = -1, None
        for tr in tracks:
            vecinos = [(o["x"], o["y"]) for o in tracks
                       if math.hypot(o["x"] - tr["x"], o["y"] - tr["y"]) <= radio]
            if len(vecinos) > best_n:
                best_n = len(vecinos)
                best_pt = (float(np.mean([v[0] for v in vecinos])),
                           float(np.mean([v[1] for v in vecinos])))
        cx, cy = best_pt if best_pt else (float(np.median([tr["x"] for tr in tracks])),
                                          float(np.median([tr["y"] for tr in tracks])))
        tipo, detalle = classify_restart_zone(cx, cy, self.cfg, self.in_meters)

        extra = {}
        if tipo == "saque_porteria" and hasattr(self, "gk_xs"):
            L = self.cfg["pitch_len_m"] if self.in_meters else 100.0
            for eq, xs2 in self.gk_xs.items():
                if xs2:
                    lado = "fondo_izquierdo" if (sum(xs2) / len(xs2)) < L / 2 else "fondo_derecho"
                    if lado == detalle:
                        extra["saca"] = eq
        if tipo == "saque_centro":
            self.kickoff_count_half += 1
            # El 1er saque de centro del vídeo suele ser inicio de parte;
            # los siguientes son casi siempre tras gol
            extra["posible_tras_gol"] = self.kickoff_count_half > 1

        self.events.append({
            "tipo": tipo,
            "detalle": detalle,
            "t": round(t, 1),
            "t_min": f"{int(t//60):02d}:{int(t%60):02d}",
            "parado_desde": round(self.stopped_since or t, 1),
            "cluster": {"x": round(cx, 1), "y": round(cy, 1)},
            **extra,
        })

    def _detect_superiority(self, tracks, t):
        n_local = sum(1 for tr in tracks if tr["team"] == "local")
        n_rival = sum(1 for tr in tracks if tr["team"] == "rival")

        state = None
        if n_local + n_rival < 9:
            n_local = n_rival = 0  # conteo no fiable: no evaluar superioridad
        if n_local >= 5 and n_rival <= 4 and n_local - n_rival >= 1:
            state = "local"
        elif n_rival >= 5 and n_local <= 4 and n_rival - n_local >= 1:
            state = "rival"

        if state != self.sup_state:
            # Cierra ventana anterior si duró lo suficiente
            if self.sup_state and self.sup_since is not None:
                dur = t - self.sup_since
                if dur >= self.cfg["superiority_min_sec"]:
                    ev = {
                        "tipo": "superioridad",
                        "equipo": self.sup_state,
                        "t": round(self.sup_since, 1),
                        "t_min": f"{int(self.sup_since//60):02d}:{int(self.sup_since%60):02d}",
                        "duracion_s": round(dur, 1),
                    }
                    ev.update(self._check_flying_gk(tracks, self.sup_state))
                    self.events.append(ev)
            self.sup_state = state
            self.sup_since = t if state else None

    def _check_flying_gk(self, tracks, team):
        """Candidato a portero-jugador: nadie del equipo en su área propia.
        Sin saber qué mitad defiende cada equipo, comprobamos ambos extremos:
        si en uno de los dos extremos el equipo no tiene a nadie y tiene 5
        jugadores adelantados, lo marcamos como posible portero-jugador."""
        if not self.in_meters:
            return {"posible_portero_jugador": False}
        L = self.cfg["pitch_len_m"]
        area = self.cfg["own_area_len_m"]
        team_x = [tr["x"] for tr in tracks if tr["team"] == team]
        if len(team_x) < 5:
            return {"posible_portero_jugador": False}
        none_left = all(x > area for x in team_x)
        none_right = all(x < L - area for x in team_x)
        return {"posible_portero_jugador": bool(none_left or none_right)}

    def _store_sample(self, tracks, t):
        def _punto(tr):
            p = {"id": tr["id"], "x": round(tr["x"], 1),
                 "y": round(tr["y"], 1), "eq": tr["team"][0]}
            if tr.get("borde"):
                p["borde"] = True
            return p
        self.samples.append({
            "t": round(t, 1),
            "p": [_punto(tr) for tr in tracks],
        })

    def _store_formation(self, tracks, t):
        snap = {"t": round(t, 1)}
        for team in ("local", "rival"):
            pts = [(tr["x"], tr["y"]) for tr in tracks if tr["team"] == team]
            if len(pts) < 3:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            snap[team] = {
                "n": len(pts),
                "cx": round(float(np.mean(xs)), 1),
                "cy": round(float(np.mean(ys)), 1),
                "prof": round(float(max(xs) - min(xs)), 1),   # profundidad
                "anch": round(float(max(ys) - min(ys)), 1),   # anchura
                # Reparto por líneas (mitades de la extensión del equipo en X):
                # p.ej. [2,2] → estructura 2-2; [1,3] → 1-3 / rombo defensivo...
                "lineas": self._line_split(xs),
            }
        if "local" in snap or "rival" in snap:
            self.formations.append(snap)

    @staticmethod
    def _line_split(xs):
        if len(xs) < 2:
            return [len(xs)]
        mid = (max(xs) + min(xs)) / 2.0
        back = sum(1 for x in xs if x <= mid)
        front = len(xs) - back
        return [back, front]

    def _close_open_events(self, t_end):
        if self.sup_state and self.sup_since is not None:
            dur = t_end - self.sup_since
            if dur >= self.cfg["superiority_min_sec"]:
                self.events.append({
                    "tipo": "superioridad",
                    "equipo": self.sup_state,
                    "t": round(self.sup_since, 1),
                    "t_min": f"{int(self.sup_since//60):02d}:{int(self.sup_since%60):02d}",
                    "duracion_s": round(dur, 1),
                })

    def _write_output(self, path, video_path, fps, vw, vh, dur_s):
        # ── Post-proceso 1: fusionar eventos duplicados (<12 s) ──
        # El mismo paron a veces genera dos reanudaciones seguidas.
        # Nos quedamos con la mejor clasificada (especifica > "otra").
        restarts = sorted([e for e in self.events if e["tipo"] != "superioridad"],
                          key=lambda e: e["t"])
        otros = [e for e in self.events if e["tipo"] == "superioridad"]
        fusionados = []
        for ev in restarts:
            if fusionados and ev["t"] - fusionados[-1]["t"] < 12.0:
                prev = fusionados[-1]
                # preferir el evento con tipo especifico
                if prev["tipo"] == "reanudacion_otra" and ev["tipo"] != "reanudacion_otra":
                    fusionados[-1] = ev
                # si ambos especificos o ambos "otra", conservar el primero
            else:
                fusionados.append(ev)

        # ── Post-proceso 2: primer paron tras el inicio = saque de centro ──
        start_s = getattr(self, "start_s", 0.0)
        if fusionados and fusionados[0]["t"] - start_s <= 30.0:
            if fusionados[0]["tipo"] == "reanudacion_otra":
                fusionados[0]["tipo"] = "saque_centro"
                fusionados[0]["detalle"] = "inicio_de_parte"
                fusionados[0].pop("posible_tras_gol", None)

        self.events = sorted(fusionados + otros, key=lambda e: e["t"])

        # Resumen de eventos por tipo para vista rapida
        counts = defaultdict(int)
        for ev in self.events:
            counts[ev["tipo"]] += 1

        out = {
            "version": 1,
            "video": {"file": video_path, "fps": round(fps, 2),
                      "w": vw, "h": vh, "duracion_s": round(dur_s, 1)},
            "coordenadas": "metros" if self.in_meters else "porcentaje_frame",
            "pista": {"largo_m": self.cfg["pitch_len_m"],
                      "ancho_m": self.cfg["pitch_wid_m"]} if self.in_meters else None,
            "esquinas_px": self.corners_px if self.in_meters else None,
            "resumen_eventos": dict(counts),
            "eventos": sorted(self.events, key=lambda e: e["t"]),
            "formaciones": self.formations,
            "heatmap_equipos": self.heat_team,
            "heatmap_jugadores": {str(k): v for k, v in self.heat_player.items()
                                   if sum(map(sum, v)) >= 50},
            "muestras": self.samples,
        }
        with open(path, "w") as f:
            json.dump(out, f, separators=(",", ":"), default=float)


# ── CLI ───────────────────────────────────────────────────────────────────────
def parse_corners(s):
    pts = []
    for pair in s.split(";"):
        x, y = pair.split(",")
        pts.append((float(x), float(y)))
    if len(pts) != 4:
        raise ValueError("Se necesitan exactamente 4 esquinas: TL;TR;BR;BL")
    return pts


def main():
    ap = argparse.ArgumentParser(description="Analizador de vídeo de partido — Futsal Commander Pro")
    ap.add_argument("video", help="Ruta del vídeo del partido (mp4/mov)")
    ap.add_argument("--output", default="analisis.json", help="JSON de salida")
    ap.add_argument("--local", default="blue", choices=list(COLOR_HSV_MAP.keys()),
                    help="Color equipación local")
    ap.add_argument("--rival", default="red", choices=list(COLOR_HSV_MAP.keys()),
                    help="Color equipación rival")
    ap.add_argument("--gklocal", default=None, choices=list(COLOR_HSV_MAP.keys()),
                    help="Color del portero local (ej. pink)")
    ap.add_argument("--gkrival", default=None, choices=list(COLOR_HSV_MAP.keys()),
                    help="Color del portero rival (ej. black)")
    ap.add_argument("--corners", default=None,
                    help='4 esquinas de pista en píxeles: "x,y;x,y;x,y;x,y" (TL;TR;BR;BL)')
    ap.add_argument("--every", type=int, default=CFG["detect_every_n"],
                    help="Procesar 1 de cada N frames (2 por defecto)")
    ap.add_argument("--start", default="0:00",
                    help='Inicio del partido "M:SS" para saltar el calentamiento')
    ap.add_argument("--maxy", type=int, default=None,
                    help="Ignorar detecciones con pies por debajo de esta fila de pixeles (gradas)")
    ap.add_argument("--muestras", default=None,
                    help='Clasificador v10: torsos de muestra "local:x,y;rival:x,y;gklocal:x,y;gkrival:x,y"')
    ap.add_argument("--muestras-t", type=float, default=30.0, dest="muestras_t",
                    help="Segundo del video donde estan los puntos de muestra (30 por defecto)")
    ap.add_argument("--end", default=None,
                    help='Fin del tramo "M:SS" (ej. final de la 1a parte)')
    args = ap.parse_args()

    CFG["detect_every_n"] = args.every
    CFG["max_foot_y"] = args.maxy
    team_colors = {"local": COLOR_HSV_MAP[args.local], "rival": COLOR_HSV_MAP[args.rival]}
    if args.gklocal:
        team_colors["gk_local"] = COLOR_HSV_MAP[args.gklocal]
    if args.gkrival:
        team_colors["gk_rival"] = COLOR_HSV_MAP[args.gkrival]

    H = None
    if args.corners:
        corners = parse_corners(args.corners)
        H = build_homography(corners, CFG["pitch_len_m"], CFG["pitch_wid_m"])
        print(f"Homografía calculada con esquinas: {corners}")
    else:
        print("AVISO: sin --corners las posiciones serán % del frame (sin perspectiva).")
        print("       Para scouting fiable, calibra las 4 esquinas de la pista.")

    analyzer = VideoAnalyzer(CFG, team_colors, homography=H, corners_px=corners if args.corners else None)
    if args.muestras:
        analyzer.refs = medir_referencias_lab(args.video, args.muestras_t, args.muestras)
        print("Clasificador v10 (cercania LAB) activo. Referencias medidas:")
        for k, v in analyzer.refs.items():
            print(f"  {k}: LAB=({v[0]:.0f}, {v[1]:.0f}, {v[2]:.0f})")
    partes = args.start.split(":")
    start_s = int(partes[0]) * 60 + int(partes[1]) if len(partes) == 2 else float(args.start)
    if start_s > 0:
        print(f"Saltando calentamiento: analisis desde {args.start}")
    end_s = None
    if args.end:
        pe = args.end.split(":")
        end_s = int(pe[0]) * 60 + int(pe[1]) if len(pe) == 2 else float(args.end)
        print(f"Analisis hasta {args.end}")
    analyzer.process(args.video, args.output, start_s=start_s, end_s=end_s)


if __name__ == "__main__":
    main()