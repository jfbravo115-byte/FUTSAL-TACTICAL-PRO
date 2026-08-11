import json, statistics
from collections import defaultdict

def cargar(path):
    d = json.load(open(path))
    m = d['muestras']
    m.sort(key=lambda x: x['t'])
    return d, m

def es_borde_geom(tid, pos, L, W, eps=0.15):
    pts = pos[tid]
    nb = sum(1 for (t,x,y) in pts if x<=eps or x>=L-eps or y<=eps or y>=W-eps)
    return nb/len(pts) > 0.8

def continuidad(m, W):
    ts_all = sorted(set(x['t'] for x in m))
    con4=0; total=0
    t = ts_all[0]
    while t + W <= ts_all[-1]:
        ventana = [x for x in m if t <= x['t'] <= t+W]
        if len(ventana) >= 2:
            sets = [set(j['id'] for j in x.get('p', [])) for x in ventana]
            comunes = set.intersection(*sets) if sets else set()
            total += 1
            if len(comunes) >= 4: con4 += 1
        t += 1.0
    return con4, total

def resumen(path, nombre, L=40.0, W=20.0):
    d, m = cargar(path)
    dur_video = d['video']['duracion_s']
    total_detecciones = sum(len(x.get('p',[])) for x in m)

    pos = defaultdict(list)
    con_flag_borde = defaultdict(int)
    for x in m:
        for j in x.get('p', []):
            pos[j['id']].append((x['t'], j['x'], j['y']))
            if j.get('borde'): con_flag_borde[j['id']] += 1

    duraciones = [max(t for t,_,_ in pts)-min(t for t,_,_ in pts) for pts in pos.values()]
    n = len(duraciones)
    ds = sorted(duraciones)
    p90 = ds[int(0.9*n)] if n else 0

    sospechosos_geom = [tid for tid in pos if es_borde_geom(tid, pos, L, W)]
    muestras_borde_geom = sum(1 for x in m for j in x.get('p',[]) if j['id'] in sospechosos_geom)
    muestras_con_flag = sum(con_flag_borde.values())

    print(f"\n=== {nombre} ===")
    print(f"total_detecciones_almacenadas: {total_detecciones}")
    print(f"total_trackIds: {n}")
    print(f"tracks_sospechosos_borde_geometrico(>80% en borde exacto): {len(sospechosos_geom)}")
    print(f"muestras-persona en borde geometrico: {muestras_borde_geom} ({100*muestras_borde_geom/total_detecciones:.1f}%)")
    print(f"muestras-persona con flag 'borde'=true (experimento ROI): {muestras_con_flag} ({100*muestras_con_flag/total_detecciones:.1f}%)" if total_detecciones else "")
    print(f"duracion media: {statistics.mean(duraciones):.2f}s  mediana: {statistics.median(duraciones):.2f}s  p90: {p90:.2f}s  max: {max(duraciones):.2f}s")
    print(f"nuevos IDs/min: {n/(dur_video/60):.1f}")
    for W_ in [5,10,20,30]:
        c4, tot = continuidad(m, W_)
        print(f"  ventana {W_}s: {c4}/{tot} ({100*c4/tot if tot else 0:.1f}%)")

    # id=1 equivalente: el track con mayor duracion, y si su rango de movimiento es casi nulo
    top = sorted(pos.items(), key=lambda kv: -(max(t for t,_,_ in kv[1])-min(t for t,_,_ in kv[1])))[:3]
    print("top 3 tracks por duracion:")
    for tid, pts in top:
        xs=[p[1] for p in pts]; ys=[p[2] for p in pts]
        dur = max(t for t,_,_ in pts)-min(t for t,_,_ in pts)
        print(f"  id={tid} dur={dur:.1f}s rango={max(max(xs)-min(xs), max(ys)-min(ys)):.2f}m n={len(pts)}")
    return d, m

resumen('/workspace/salidas/baselineA_clean.json', 'BASELINE (margen=4.0m, buffer=30, sin color)')
resumen('/workspace/salidas/roi_v1.json', 'ROI v1 (margen=0.5m, buffer=30, sin color)')
