import json, cv2, numpy as np, os
from collections import defaultdict

d_base = json.load(open('/workspace/salidas/baselineA_clean.json'))
m_base = d_base['muestras']
L = d_base['pista']['largo_m']; W = d_base['pista']['ancho_m']
esquinas_px = d_base['esquinas_px']
src = np.array(esquinas_px, dtype=np.float32)
dst = np.array([[0,0],[L,0],[L,W],[0,W]], dtype=np.float32)
H, _ = cv2.findHomography(src, dst)
H_inv = np.linalg.inv(H)
def metros_a_px(x, y):
    pt = np.array([[[x, y]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H_inv)[0][0]
    return float(out[0]), float(out[1])

pos = defaultdict(list)
for x in m_base:
    for j in x.get('p', []):
        pos[j['id']].append((x['t'], j['x'], j['y'], j['eq']))

video_path = '/workspace/videos/up_e17327f8.mp4'
cap = cv2.VideoCapture(video_path)
os.makedirs('/workspace/frames_roi', exist_ok=True)

def extraer(t, tid, x, y, tag):
    px, py = metros_a_px(x, y)
    cap.set(cv2.CAP_PROP_POS_MSEC, t*1000)
    ok, frame = cap.read()
    if not ok: return
    fm = frame.copy()
    cv2.circle(fm, (int(px), int(py)), 15, (0,0,255), 3)
    cv2.putText(fm, f"{tag} id={tid} t={t:.1f} pos=({x:.2f},{y:.2f})", (10,20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,255), 2)
    cv2.imwrite(f'/workspace/frames_roi/{tag}_id{tid}_t{t:.1f}.jpg', fm, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(f"guardado: {tag}_id{tid}_t{t:.1f}.jpg  pos=({x:.2f},{y:.2f})")

# Caso A: id=7 (confirmado jugador real) en su momento mas cercano a banda (y=20)
extraer(1.4, 7, 17.2, 20.0, "casoA_jugador_banda")

# Caso B: buscar un id con x cerca de 0 o L (linea de fondo), duracion razonable (no efimero)
candB = None
for tid, pts in pos.items():
    for (t,x,y,eq) in pts:
        if (x < 1.0 or x > L-1.0) and 2.0 < y < W-2.0:  # cerca de fondo, no en esquina
            dur = max(p[0] for p in pts) - min(p[0] for p in pts)
            if dur > 1.0:  # con algo de duracion, mas probable que sea real
                candB = (t, tid, x, y)
                break
    if candB: break
if candB:
    t,tid,x,y = candB
    extraer(t, tid, x, y, "casoB_linea_fondo")
else:
    print("no se encontro candidato B")

# Caso C: esquina (cerca de x=0/L Y de y=0/W simultaneamente)
candC = None
for tid, pts in pos.items():
    for (t,x,y,eq) in pts:
        if (x < 2.0 or x > L-2.0) and (y < 2.0 or y > W-2.0):
            candC = (t, tid, x, y)
            break
    if candC: break
if candC:
    t,tid,x,y = candC
    extraer(t, tid, x, y, "casoC_esquina")
else:
    print("no se encontro candidato C (corner)")

# Caso D y E: dos de los ids "sospechosos de borde" del baseline (80 en total), distintos de id=1 y de casos ya vistos
def es_borde_geom(tid, eps=0.15):
    pts = pos[tid]
    nb = sum(1 for (t,x,y,eq) in pts if x<=eps or x>=L-eps or y<=eps or y>=W-eps)
    return nb/len(pts) > 0.8
sospechosos = [tid for tid in pos if es_borde_geom(tid) and tid not in (1,7)]
sospechosos_largos = sorted(sospechosos, key=lambda tid: -(max(p[0] for p in pos[tid])-min(p[0] for p in pos[tid])))
for i, tid in enumerate(sospechosos_largos[:2]):
    t, x, y, eq = pos[tid][len(pos[tid])//2]  # punto medio de su vida
    extraer(t, tid, x, y, f"casoDE{i+1}_sospechoso")

cap.release()
print("listo casos paso2")
