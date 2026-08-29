"""
servidor_analisis.py — Futsal Commander Pro · Servidor de Analisis (Fase Producto)
===================================================================================
Convierte el motor (video_analyzer.py) en un servicio web. La app le manda un
enlace de YouTube o un archivo, y el servidor descarga, analiza y devuelve el
JSON, informando del progreso en todo momento.

Endpoints:
  GET  /salud                     → comprobar que el servidor vive
  POST /subir                     → subir un archivo de video (multipart)
  POST /analizar                  → lanzar analisis {url | video_id, params...}
  GET  /estado/{job_id}           → progreso: descargando/analizando/completado
  GET  /resultado/{job_id}        → el JSON de analisis terminado
  GET  /frame/{video_id}?t=30     → fotograma JPEG (para el asistente de calibracion)

Arranque:
  pip install fastapi uvicorn python-multipart
  python servidor_analisis.py          (escucha en el puerto 8000)

Tunel publico (en otra terminal):
  ./cloudflared tunnel --url http://localhost:8000
"""

import json
import os
import re
import subprocess
import threading
import time
import uuid

import cv2
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, FileResponse

app = FastAPI(title="Futsal Commander · Servidor de Analisis")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

BASE = "/workspace"
VIDEOS = os.path.join(BASE, "videos")
SALIDAS = os.path.join(BASE, "salidas")
os.makedirs(VIDEOS, exist_ok=True)
os.makedirs(SALIDAS, exist_ok=True)

JOBS = {}  # job_id -> {estado, progreso, mensaje, video_id, salida}


def _nuevo_job(video_id):
    job_id = uuid.uuid4().hex[:10]
    JOBS[job_id] = {"estado": "en_cola", "progreso": 0, "mensaje": "",
                    "video_id": video_id,
                    "salida": os.path.join(SALIDAS, f"{job_id}.json")}
    return job_id


def _descargar_youtube(url, destino, job, factor=0.3):
    job["estado"] = "descargando"
    job["mensaje"] = "Descargando video de YouTube..."
    cmd = ["yt-dlp", "--remote-components", "ejs:github",
           "-f", "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]",
           "-o", destino, url]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    for linea in proc.stdout:
        m = re.search(r"\[download\]\s+([\d.]+)%", linea)
        if m:
            job["progreso"] = round(float(m.group(1)) * factor)
    proc.wait()
    if proc.returncode != 0 or not os.path.exists(destino):
        raise RuntimeError("La descarga de YouTube fallo")


def _analizar(video_path, salida, params, job):
    job["estado"] = "analizando"
    job["mensaje"] = "Analizando el partido con el motor..."
    cmd = ["python3", os.path.join(BASE, "video_analyzer.py"), video_path,
           "--output", salida]
    mapa = {"local": "--local", "rival": "--rival",
            "gklocal": "--gklocal", "gkrival": "--gkrival",
            "corners": "--corners", "start": "--start", "end": "--end",
            "maxy": "--maxy", "muestras": "--muestras",
            "muestras_t": "--muestras-t"}
    for k, flag in mapa.items():
        v = params.get(k)
        if v not in (None, ""):
            cmd += [flag, str(v)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    cola = []
    for linea in proc.stdout:
        cola.append(linea.rstrip())
        cola = cola[-25:]
        m = re.search(r"^\s*([\d.]+)%", linea)
        if m:
            job["progreso"] = 30 + round(float(m.group(1)) * 0.7)  # analisis = 30-100%
            job["mensaje"] = linea.strip()
    proc.wait()
    if proc.returncode != 0 or not os.path.exists(salida):
        raise RuntimeError("El motor fallo:\n" + "\n".join(cola))


def _trabajo_descarga(job_id, url):
    job = JOBS[job_id]
    try:
        video_path = os.path.join(VIDEOS, f"{job['video_id']}.mp4")
        if not os.path.exists(video_path):
            _descargar_youtube(url, video_path, job, factor=1.0)
            job["progreso"] = 100
        else:
            job["progreso"] = 100
        job["estado"] = "completado"
        job["mensaje"] = "Video disponible"
    except Exception as e:
        job["estado"] = "error"
        job["mensaje"] = str(e)[:800]


def _trabajo(job_id, url, params):
    job = JOBS[job_id]
    try:
        video_id = job["video_id"]
        video_path = os.path.join(VIDEOS, f"{video_id}.mp4")
        if url and not os.path.exists(video_path):
            _descargar_youtube(url, video_path, job)
        if not os.path.exists(video_path):
            raise RuntimeError("No existe el video para analizar")
        _analizar(video_path, job["salida"], params, job)
        job["estado"] = "completado"
        job["progreso"] = 100
        job["mensaje"] = "Analisis completado"
    except Exception as e:
        job["estado"] = "error"
        job["mensaje"] = str(e)[:800]


@app.get("/salud")
def salud():
    return {"ok": True, "motor": os.path.exists(os.path.join(BASE, "video_analyzer.py")),
            "jobs_activos": sum(1 for j in JOBS.values()
                                if j["estado"] in ("descargando", "analizando"))}


@app.post("/subir")
async def subir(archivo: UploadFile = File(...)):
    video_id = "up_" + uuid.uuid4().hex[:8]
    destino = os.path.join(VIDEOS, f"{video_id}.mp4")
    with open(destino, "wb") as f:
        while True:
            trozo = await archivo.read(1024 * 1024 * 8)
            if not trozo:
                break
            f.write(trozo)
    return {"video_id": video_id, "bytes": os.path.getsize(destino)}


@app.post("/descargar")
async def descargar(cuerpo: dict):
    """Descarga el video de YouTube SIN analizarlo (para calibrar sobre el fotograma)."""
    url = cuerpo.get("url")
    if not url:
        return JSONResponse({"error": "Falta url"}, status_code=400)
    m = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([\w-]{11})", url)
    video_id = "yt_" + (m.group(1) if m else uuid.uuid4().hex[:8])
    job_id = _nuevo_job(video_id)
    threading.Thread(target=_trabajo_descarga, args=(job_id, url), daemon=True).start()
    return {"job_id": job_id, "video_id": video_id}


@app.get("/videos")
def videos():
    """Lista los videos ya disponibles en el servidor."""
    out = []
    for f in sorted(os.listdir(VIDEOS)):
        if f.endswith(".mp4"):
            out.append({"video_id": f[:-4],
                        "mb": round(os.path.getsize(os.path.join(VIDEOS, f)) / 1e6)})
    return out


@app.post("/analizar")
async def analizar(cuerpo: dict):
    url = cuerpo.get("url")
    video_id = cuerpo.get("video_id")
    if url and not video_id:
        m = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([\w-]{11})", url)
        video_id = "yt_" + (m.group(1) if m else uuid.uuid4().hex[:8])
    if not url and not video_id:
        return JSONResponse({"error": "Falta url o video_id"}, status_code=400)
    job_id = _nuevo_job(video_id)
    params = cuerpo.get("params", {})
    threading.Thread(target=_trabajo, args=(job_id, url, params), daemon=True).start()
    return {"job_id": job_id, "video_id": video_id}


@app.get("/estado/{job_id}")
def estado(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"error": "job no encontrado"}, status_code=404)
    return {k: job[k] for k in ("estado", "progreso", "mensaje", "video_id")}


@app.get("/resultado/{job_id}")
def resultado(job_id: str):
    job = JOBS.get(job_id)
    if job:
        if job["estado"] != "completado":
            return JSONResponse({"error": "aun no completado", "estado": job["estado"]},
                                status_code=409)
        with open(job["salida"]) as f:
            return Response(f.read(), media_type="application/json")
    # Fallback: job no esta en memoria (p.ej. tras reinicio del servidor),
    # pero el archivo de salida SI existe en disco -- servirlo directamente.
    ruta_disco = os.path.join(SALIDAS, f"{job_id}.json")
    if os.path.exists(ruta_disco):
        with open(ruta_disco) as f:
            return Response(f.read(), media_type="application/json")
    return JSONResponse({"error": "job no encontrado"}, status_code=404)


@app.get("/video/{video_id}")
def video(video_id: str):
    """Sirve el archivo de video (con soporte de rangos) para reproducirlo en el visor."""
    p = os.path.join(VIDEOS, f"{video_id}.mp4")
    if not os.path.exists(p):
        return JSONResponse({"error": "video no encontrado"}, status_code=404)
    return FileResponse(p, media_type="video/mp4")


@app.get("/frame/{video_id}")
def frame(video_id: str, t: float = 30.0):
    video_path = os.path.join(VIDEOS, f"{video_id}.mp4")
    if not os.path.exists(video_path):
        return JSONResponse({"error": "video no encontrado"}, status_code=404)
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, img = cap.read()
    cap.release()
    if not ok:
        return JSONResponse({"error": "no se pudo leer el frame"}, status_code=500)
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(jpg.tobytes(), media_type="image/jpeg")


if __name__ == "__main__":
    import uvicorn
    print("Servidor de Analisis en http://0.0.0.0:8000  (Ctrl+C para parar)")
    uvicorn.run(app, host="0.0.0.0", port=8000)
