import json, math, cv2, numpy as np
from collections import defaultdict

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
pos = defaultdict(list)
for x in m:
    for j in x.get('p', []):
        pos[j['id']].append((x['t'], j['x'], j['y']))
for tid in pos: pos[tid].sort()

# Filtrar candidatos que NO sean sospechosos de borde (para centrarnos en jugadores reales)
def es_borde(tid):
    pts = pos[tid]
    nb = sum(1 for (t,x,y) in pts if x<=0.2 or x>=L-0.2 or y<=0.2 or y>=W-0.2)
    return nb/len(pts) > 0.7

finales = [(tid, pos[tid][-1]) for tid in pos if not es_borde(tid) and len(pos[tid])>=3]
inicios = [(tid, pos[tid][0]) for tid in pos if not es_borde(tid) and len(pos[tid])>=3]

candidatos = []
for tidA, (tA,xA,yA) in finales:
    for tidB, (tB,xB,yB) in inicios:
        if tidA==tidB: continue
        dt = tB - tA
        if 0 < dt <= 0.8:
            dist = math.hypot(xB-xA, yB-yA)
            if dist <= 2.0:
                candidatos.append((tidA,tidB,tA,tB,dt,dist,xA,yA,xB,yB))
candidatos.sort(key=lambda c: (c[4], c[5]))

print(f"Candidatos de fragmentacion (excluyendo ids de borde): {len(candidatos)}")
elegidos = candidatos[:4]
for c in elegidos:
    tidA,tidB,tA,tB,dt,dist,xA,yA,xB,yB = c
    print(f"  A={tidA}(fin t={tA:.1f}) -> B={tidB}(inicio t={tB:.1f})  gap={dt:.2f}s dist={dist:.2f}m")

# Extraer frames: 1 justo antes del fin de A, 1-2 en el hueco, 1 justo tras inicio de B
video_path = '/workspace/videos/up_e17327f8.mp4'
cap = cv2.VideoCapture(video_path)
import os
os.makedirs('/workspace/frames_frag', exist_ok=True)
for idx, c in enumerate(elegidos):
    tidA,tidB,tA,tB,dt,dist,xA,yA,xB,yB = c
    pxA, pyA = metros_a_px(xA, yA)
    pxB, pyB = metros_a_px(xB, yB)
    for tag, t, px, py, tid in [('A_fin', tA, pxA, pyA, tidA), ('hueco', (tA+tB)/2, (pxA+pxB)/2, (pyA+pyB)/2, '?'), ('B_inicio', tB, pxB, pyB, tidB)]:
        cap.set(cv2.CAP_PROP_POS_MSEC, t*1000)
        ok, frame = cap.read()
        if not ok: continue
        fm = frame.copy()
        cv2.circle(fm, (int(px), int(py)), 18, (0,0,255), 3)
        cv2.putText(fm, f"caso{idx+1} {tag} id={tid} t={t:.2f}", (10,20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,255), 2)
        cv2.imwrite(f'/workspace/frames_frag/caso{idx+1}_{tag}_t{t:.2f}.jpg', fm, [cv2.IMWRITE_JPEG_QUALITY, 85])
cap.release()
print("frames guardados en /workspace/frames_frag/")
