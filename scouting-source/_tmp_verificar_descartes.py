import json, cv2, numpy as np
from collections import defaultdict

d_base, m_base = json.load(open('/workspace/salidas/baselineA_clean.json')), None
d_base = json.load(open('/workspace/salidas/baselineA_clean.json'))
m_base = d_base['muestras']
d_roi = json.load(open('/workspace/salidas/roi_v1.json'))
m_roi = d_roi['muestras']

esquinas_px = d_base['esquinas_px']
L = d_base['pista']['largo_m']; W = d_base['pista']['ancho_m']
src = np.array(esquinas_px, dtype=np.float32)
dst = np.array([[0,0],[L,0],[L,W],[0,W]], dtype=np.float32)
H, _ = cv2.findHomography(src, dst)
H_inv = np.linalg.inv(H)
def metros_a_px(x, y):
    pt = np.array([[[x, y]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H_inv)[0][0]
    return float(out[0]), float(out[1])

# Buscar detecciones en BASELINE que estaban CERCA de la linea (0.5-2m fuera) - candidatos a "jugador real cerca de banda"
# que el ROI v1 podria haber descartado. Buscamos ids en baseline con posiciones entre 0.5 y 3m fuera de pista
# (es decir, pasaban el margen viejo de 4m pero NO el nuevo de 0.5m)
candidatos = []
for x in m_base:
    for j in x.get('p', []):
        # aproximar si estaba en la franja perdida: como ya esta clampeado en baseline, no puedo saber el raw exacto
        # pero puedo comparar directamente: ¿este (t, id_aprox_pos) aparece en roi_v1 en el mismo t y pos similar?
        pass

# Mejor: comparar CONTEO de personas detectadas en cada timestamp exacto entre baseline y roi_v1
conteo_base = {x['t']: len(x.get('p',[])) for x in m_base}
conteo_roi = {x['t']: len(x.get('p',[])) for x in m_roi}
diffs = []
for t in conteo_base:
    if t in conteo_roi:
        diffs.append((t, conteo_base[t], conteo_roi[t], conteo_base[t]-conteo_roi[t]))
diffs.sort(key=lambda d: d[0])
print("t | n_baseline | n_roi | diferencia (positivo = roi tiene MENOS)")
for t, nb, nr, diff in diffs[:20]:
    print(f"  t={t:.1f}  base={nb}  roi={nr}  diff={diff}")

# Elegir un timestamp donde roi tiene MENOS detecciones que baseline, para inspeccionar visualmente
# que se perdio (podria ser el falso positivo desapareciendo, bien) o un jugador real (mal)
mayor_diff = max(diffs, key=lambda d: d[3])
print(f"\nMayor diferencia: t={mayor_diff[0]:.1f} base={mayor_diff[1]} roi={mayor_diff[2]}")

video_path = '/workspace/videos/up_e17327f8.mp4'
cap = cv2.VideoCapture(video_path)
import os
os.makedirs('/workspace/frames_roi', exist_ok=True)

t_elegido = mayor_diff[0]
m_base_t = next(x for x in m_base if x['t']==t_elegido)
m_roi_t = next(x for x in m_roi if x['t']==t_elegido)
ids_base = set(j['id'] for j in m_base_t['p'])
ids_roi = set(j['id'] for j in m_roi_t['p'])
ids_perdidos = ids_base - ids_roi
print(f"ids presentes en baseline pero NO en roi_v1 en t={t_elegido}: {ids_perdidos}")

cap.set(cv2.CAP_PROP_POS_MSEC, t_elegido*1000)
ok, frame = cap.read()
if ok:
    fm = frame.copy()
    for j in m_base_t['p']:
        px, py = metros_a_px(j['x'], j['y'])
        color = (0,0,255) if j['id'] in ids_perdidos else (0,255,0)
        cv2.circle(fm, (int(px), int(py)), 12, color, 2)
        cv2.putText(fm, str(j['id']), (int(px)-10, int(py)-15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
    cv2.putText(fm, f"t={t_elegido:.1f} ROJO=perdido por ROI v1, VERDE=se mantiene", (10,20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,0), 2)
    cv2.imwrite(f'/workspace/frames_roi/comparacion_t{t_elegido:.1f}.jpg', fm, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print("guardado comparacion")
cap.release()
