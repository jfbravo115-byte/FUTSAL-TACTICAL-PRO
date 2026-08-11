import json, cv2, numpy as np, sys, os

d = json.load(open('/workspace/salidas/baselineA_clean.json'))
esquinas_px = d['esquinas_px']
L = d['pista']['largo_m']; W = d['pista']['ancho_m']

src = np.array(esquinas_px, dtype=np.float32)
dst = np.array([[0,0],[L,0],[L,W],[0,W]], dtype=np.float32)
H, _ = cv2.findHomography(src, dst)
H_inv = np.linalg.inv(H)

def metros_a_px(x, y):
    pt = np.array([[[x, y]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H_inv)[0][0]
    return float(out[0]), float(out[1])

m = d['muestras']
video_path = '/workspace/videos/up_e17327f8.mp4'
cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS)

def extraer(tid, timestamps, prefix):
    os.makedirs('/workspace/frames', exist_ok=True)
    for t in timestamps:
        # buscar la posicion de ese id en la muestra mas cercana a t
        mejor = min(m, key=lambda mm: abs(mm['t']-t))
        j = next((jj for jj in mejor.get('p',[]) if jj['id']==tid), None)
        if not j:
            print(f"  t={t}: id={tid} no encontrado en esa muestra")
            continue
        px, py = metros_a_px(j['x'], j['y'])
        cap.set(cv2.CAP_PROP_POS_MSEC, mejor['t']*1000)
        ok, frame = cap.read()
        if not ok:
            print(f"  t={t}: no se pudo leer el frame")
            continue
        # marcar con un circulo grande y guardar tanto el frame completo como un recorte
        frame_marcado = frame.copy()
        cv2.circle(frame_marcado, (int(px), int(py)), 15, (0,0,255), 3)
        cv2.putText(frame_marcado, f"id={tid} t={mejor['t']:.1f}", (int(px)-40, int(py)-25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)
        out_path = f"/workspace/frames/{prefix}_t{mejor['t']:.1f}.jpg"
        cv2.imwrite(out_path, frame_marcado, [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(f"  t={mejor['t']:.1f}: id={tid} en px=({px:.0f},{py:.0f})  guardado -> {out_path}")

print("=== id=1 (STATIC_CANDIDATE mas persistente, dur=124.2s) ===")
extraer(1, [0.1, 30.0, 60.0, 90.0, 124.0], "id1")

print("\n=== id=7 (oscilacion de equipo r->l->r) ===")
extraer(7, [0.1, 0.6, 0.9, 1.4, 2.5], "id7")

print(f"\nvideo fps={fps}  resolucion={cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
cap.release()
