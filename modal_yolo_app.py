"""
Futsal Commander Pro - YOLO Player Tracking on Modal
Despliegue serverless: GPU solo se activa durante el análisis, se apaga sola.
"""
import modal
import uuid
from typing import Dict

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "fastapi[standard]==0.115.0",
        "ultralytics==8.3.0",
        "opencv-python-headless==4.10.0.84",
        "numpy==1.26.4",
        "requests==2.32.3",
    )
)

app = modal.App("futsal-commander-yolo", image=image)

# Volume para no re-descargar el modelo YOLO en cada arranque
model_volume = modal.Volume.from_name("yolo-weights", create_if_missing=True)
video_volume = modal.Volume.from_name("futsal-videos", create_if_missing=True)


@app.function(
    gpu="T4",
    timeout=1800,
    volumes={"/models": model_volume, "/videos": video_volume},
)
def analyze_video_with_tracking(video_path: str, params: Dict) -> Dict:
    """
    Corre YOLOv8 + tracking (ByteTrack) sobre el vídeo y devuelve
    las posiciones de cada jugador por frame.
    """
    import cv2
    from ultralytics import YOLO

    model_path = "/models/yolov8s.pt"
    model = YOLO(model_path if __import__("os").path.exists(model_path) else "yolov8s.pt")
    if not __import__("os").path.exists(model_path):
        model.save(model_path)
        model_volume.commit()

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames_data = []
    frame_idx = 0

    local_color = params.get("local_color", "blue")
    rival_color = params.get("rival_color", "red")

    # track() con persist=True mantiene IDs consistentes entre frames
    results = model.track(
        source=video_path,
        classes=[0],  # clase 0 = "person" en COCO
        persist=True,
        tracker="bytetrack.yaml",
        stream=True,
        verbose=False,
    )

    for result in results:
        frame_data = {"frame": frame_idx, "timestamp": frame_idx / fps, "players": []}

        if result.boxes is not None and result.boxes.id is not None:
            boxes = result.boxes.xywh.cpu().numpy()
            ids = result.boxes.id.cpu().numpy().astype(int)
            confs = result.boxes.conf.cpu().numpy()

            for box, track_id, conf in zip(boxes, ids, confs):
                x_center, y_center, w, h = box
                # Heurística simple local/rival: se ajusta luego con color real de camiseta
                team = "local" if track_id % 2 == 0 else "rival"
                frame_data["players"].append({
                    "id": int(track_id),
                    "team": team,
                    "x": float(x_center),
                    "y": float(y_center),
                    "confidence": float(conf),
                })

        frames_data.append(frame_data)
        frame_idx += 1

    cap.release()

    return {
        "status": "completed",
        "total_frames": frame_idx,
        "fps": fps,
        "frames": frames_data,
    }


@app.function(volumes={"/videos": video_volume}, timeout=600)
def download_video(url: str) -> str:
    import requests

    video_id = f"video_{uuid.uuid4().hex[:8]}.mp4"
    dest = f"/videos/{video_id}"

    resp = requests.get(url, stream=True, timeout=300)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

    video_volume.commit()
    return dest


@app.function()
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI

    api = FastAPI()
    jobs_state: Dict[str, dict] = {}

    @api.get("/salud")
    def health():
        return {"ok": True, "motor": "yolo-real", "jobs_activos": len(jobs_state)}

    @api.post("/descargar")
    def descargar(data: dict):
        url = data.get("url", "")
        video_path = download_video.remote(url)
        return {"video_id": video_path}

    @api.post("/analizar")
    def analizar(data: dict):
        video_id = data.get("video_id", "")
        params = data.get("params", {})
        job_id = f"job_{uuid.uuid4().hex[:12]}"

        jobs_state[job_id] = {"status": "processing", "video_id": video_id, "progress": 10}

        try:
            resultado = analyze_video_with_tracking.remote(video_id, params)
            jobs_state[job_id]["status"] = "completed"
            jobs_state[job_id]["resultado"] = resultado
            jobs_state[job_id]["progress"] = 100
        except Exception as e:
            jobs_state[job_id]["status"] = "error"
            jobs_state[job_id]["error"] = str(e)

        return {"job_id": job_id, "status": jobs_state[job_id]["status"]}

    @api.get("/estado/{job_id}")
    def estado(job_id: str):
        job = jobs_state.get(job_id)
        if not job:
            return {"error": "Job no encontrado"}
        return {"estado": job["status"], "progreso": job.get("progress", 0)}

    @api.get("/resultado/{job_id}")
    def resultado(job_id: str):
        job = jobs_state.get(job_id)
        if not job or job["status"] != "completed":
            return {"error": "Job no completado"}
        return job.get("resultado", {})

    return api
