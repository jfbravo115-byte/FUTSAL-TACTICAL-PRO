import json, statistics, math
from collections import defaultdict

DUR_MIN_PARA_JUZGAR_S = 3.0
RANGO_MAX_M = 1.5
VELOCIDAD_MEDIA_MAX_MS = 0.25

def cargar(path):
    d = json.load(open(path))
    m = d['muestras']
    m.sort(key=lambda x: x['t'])
    return d, m

def clasificar_tracks(m):
    pos = defaultdict(list)
    for x in m:
        for j in x.get('p', []):
            pos[j['id']].append((x['t'], j['x'], j['y']))
    resultado = {}
    for tid, pts in pos.items():
        pts.sort()
        t0, t1 = pts[0][0], pts[-1][0]
        dur = t1 - t0
        xs = [p[1] for p in pts]; ys = [p[2] for p in pts]
        rango = max(max(xs)-min(xs), max(ys)-min(ys))
        dist_total = sum(math.hypot(pts[i][1]-pts[i-1][1], pts[i][2]-pts[i-1][2]) for i in range(1, len(pts)))
        vel_media = dist_total / dur if dur > 0 else 0
        if dur < DUR_MIN_PARA_JUZGAR_S:
            categoria = 'CORTO_NO_EVALUABLE'
        elif rango < RANGO_MAX_M and vel_media < VELOCIDAD_MEDIA_MAX_MS:
            categoria = 'STATIC_CANDIDATE'
        else:
            categoria = 'MOVIL'
        resultado[tid] = {'dur': dur, 'rango': rango, 'vel_media': vel_media, 'n': len(pts),
                           't0': t0, 't1': t1, 'categoria': categoria, 'pts': pts}
    return resultado

def continuidad(m, excluir, W):
    ts_all = sorted(set(x['t'] for x in m))
    con4 = 0; total = 0
    t = ts_all[0]
    while t + W <= ts_all[-1]:
        ventana = [x for x in m if t <= x['t'] <= t+W]
        if len(ventana) >= 2:
            sets = [set(j['id'] for j in x.get('p', []) if j['id'] not in excluir) for x in ventana]
            comunes = set.intersection(*sets) if sets else set()
            total += 1
            if len(comunes) >= 4: con4 += 1
        t += 1.0
    return con4, total

def resumen(path, nombre):
    d, m = cargar(path)
    clas = clasificar_tracks(m)
    cats = defaultdict(list)
    for tid, info in clas.items():
        cats[info['categoria']].append(tid)

    duraciones_todas = [info['dur'] for info in clas.values()]
    n = len(duraciones_todas)
    ds = sorted(duraciones_todas)
    p90 = ds[int(0.9*n)] if n else 0
    dur_video = d['video']['duracion_s']

    print(f"\n=== {nombre} ===")
    print(f"--- Metricas de TODOS los tracks (sin exclusion) ---")
    print(f"total_ids: {n}  duracion media: {statistics.mean(duraciones_todas):.2f}s  mediana: {statistics.median(duraciones_todas):.2f}s  p90: {p90:.2f}s  max: {max(duraciones_todas):.2f}s")
    print(f">2s: {sum(1 for x in duraciones_todas if x>2)}  >5s: {sum(1 for x in duraciones_todas if x>5)}  >10s: {sum(1 for x in duraciones_todas if x>10)}")
    print(f"nuevos IDs/min: {n/(dur_video/60):.1f}")
    print(f"\n--- Categorias ---")
    for cat in ['MOVIL', 'STATIC_CANDIDATE', 'CORTO_NO_EVALUABLE']:
        print(f"  {cat}: {len(cats[cat])}")
    print(f"\n  STATIC_CANDIDATE (top 15 por duracion):")
    stat = sorted([(tid, clas[tid]) for tid in cats['STATIC_CANDIDATE']], key=lambda kv: -kv[1]['dur'])
    for tid, info in stat[:15]:
        print(f"    id={tid}  dur={info['dur']:.1f}s  rango={info['rango']:.2f}m  vel_media={info['vel_media']:.2f}m/s  n={info['n']}  t=[{info['t0']:.1f},{info['t1']:.1f}]")

    print(f"\n--- Continuidad RAW (sin excluir nada) ---")
    for W in [5,10,20,30]:
        c4, tot = continuidad(m, set(), W)
        print(f"  ventana {W}s: {c4}/{tot} ({100*c4/tot if tot else 0:.1f}%)")

    return clas, m, d

r_a, m_a, d_a = resumen('/workspace/salidas/baselineA_clean.json', 'BASELINE A (buffer=30)')
r_b, m_b, d_b = resumen('/workspace/salidas/test_buffer150.json', 'VARIANTE B (buffer=150)')

import pickle
with open('/workspace/clasificacion.pkl', 'wb') as f:
    pickle.dump({'A': (r_a, m_a), 'B': (r_b, m_b)}, f)
print("\nGuardado en /workspace/clasificacion.pkl para uso posterior (frames, deteccion vs tracker)")
