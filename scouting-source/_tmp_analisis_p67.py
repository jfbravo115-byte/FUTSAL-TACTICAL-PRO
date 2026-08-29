import json, cv2, numpy as np, math, os
from collections import defaultdict

d_base = json.load(open('/workspace/salidas/baselineA_clean.json'))
m_base = d_base['muestras']
d_roi = json.load(open('/workspace/salidas/roi_v1.json'))
m_roi = d_roi['muestras']
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

# ============ PASO 4: distribucion de distancia fuera de pista de lo descartado ============
# Necesito el RAW (antes de clamp). Como baseline SI clampeaba con margen 4m, su x/y guardado
# YA esta clampeado a [0,L]x[0,W] si estaba dentro de ese margen amplio. Para saber cuanto
# estaba REALMENTE fuera (raw), comparo baseline (margen 4m, clampeado a [0,L]x[0,W]) contra
# roi_v1 (margen 0.5m): las detecciones presentes en baseline pero AUSENTES en roi_v1, en el
# MISMO (t, posicion aproximada) nos dan candidatos. Pero baseline ya perdio el dato raw exacto
# (esta clampeado). Por tanto, para PASO 4 necesito recalcular usando el CODIGO de homografia
# directamente sobre las cajas YOLO... eso requeriria re-ejecutar deteccion. En su lugar, uso el
# ANALISIS ORIGINAL SIN CLAMP: como truco, el archivo roi_v1 SI tiene raw disponible porque
# el margen es mas estricto -> los puntos que pasan el margen 0.5m pero estan fuera de [0,L]x[0,W]
# llevan flag borde:true y estan clampeados a la linea. Para saber CUANTO estaban fuera exactamente
# no tengo ese dato guardado (solo el flag booleano). Documentar esta limitacion.

detecciones_con_flag = []
for x in m_roi:
    for j in x.get('p', []):
        if j.get('borde'):
            detecciones_con_flag.append((x['t'], j['id'], j['x'], j['y']))
print(f"=== PASO 6: flag 'borde' ===")
print(f"total muestras con flag borde=true en roi_v1: {len(detecciones_con_flag)}")
ids_con_flag = set(d[1] for d in detecciones_con_flag)
print(f"ids distintos que alguna vez tuvieron el flag: {len(ids_con_flag)}")
for t,tid,x,y in detecciones_con_flag[:15]:
    print(f"  t={t:.1f} id={tid} x={x:.2f} y={y:.2f} (clampeado a la linea, originalmente fuera)")

# ============ PASO 7: interpretar ventanas RAW positivas del baseline ============
print(f"\n=== PASO 7: inspeccion de ventanas 5s positivas del baseline (17/120) ===")
def comunes_ventana(m, t0, W_):
    ventana = [x for x in m if t0 <= x['t'] <= t0+W_]
    if len(ventana) < 2: return None
    sets = [set(j['id'] for j in x.get('p', [])) for x in ventana]
    return set.intersection(*sets) if sets else set()

# recorrer para encontrar las ventanas de 5s con >=4 comunes en BASELINE, muestreo cada 1s
ts_all = sorted(set(x['t'] for x in m_base))
ventanas_positivas = []
t = ts_all[0]
while t + 5 <= ts_all[-1]:
    com = comunes_ventana(m_base, t, 5)
    if com is not None and len(com) >= 4:
        ventanas_positivas.append((t, com))
    t += 1.0
print(f"ventanas positivas encontradas: {len(ventanas_positivas)}")

# Para cada id involucrado en las primeras 5 ventanas positivas, ver si esta en la lista de 80 sospechosos de borde
pos_all = defaultdict(list)
for x in m_base:
    for j in x.get('p', []):
        pos_all[j['id']].append((x['t'], j['x'], j['y']))
def es_borde_geom(tid, eps=0.15):
    pts = pos_all[tid]
    nb = sum(1 for (t,x,y) in pts if x<=eps or x>=L-eps or y<=eps or y>=W-eps)
    return nb/len(pts) > 0.8

for t0, ids in ventanas_positivas[:6]:
    clasif = {tid: ('BORDE_SOSPECHOSO' if es_borde_geom(tid) else 'normal') for tid in ids}
    print(f"  ventana t=[{t0:.1f},{t0+5:.1f}]  ids={sorted(ids)}  clasificacion={clasif}")

