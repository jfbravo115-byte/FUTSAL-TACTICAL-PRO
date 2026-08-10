import json, sys, statistics
from collections import defaultdict

UMBRAL_MOVIMIENTO_M = 2.0  # rango total de desplazamiento minimo para considerarse "jugador real"

def cargar(path):
    d = json.load(open(path))
    m = d['muestras']
    m.sort(key=lambda x: x['t'])
    return d, m

def detectar_estaticos(m):
    pos = defaultdict(list)
    for x in m:
        for j in x.get('p', []):
            pos[j['id']].append((j['x'], j['y']))
    estaticos = []
    for tid, ps in pos.items():
        if len(ps) < 5: continue
        xs = [p[0] for p in ps]; ys = [p[1] for p in ps]
        rango = max(max(xs)-min(xs), max(ys)-min(ys))
        if rango < UMBRAL_MOVIMIENTO_M:
            estaticos.append((tid, rango, len(ps)))
    return estaticos

def analizar(path, nombre, excluir):
    d, m = cargar(path)
    dur_video = d['video']['duracion_s']
    vida = defaultdict(list)
    for x in m:
        for j in x.get('p', []):
            if j['id'] in excluir: continue
            vida[j['id']].append(x['t'])
    duraciones = [max(t)-min(t) for t in vida.values()]
    n = len(duraciones)

    continuidad = {}
    ts_all = sorted(set(x['t'] for x in m))
    for W in [5, 10, 20, 30]:
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
        continuidad[W] = (con4, total, round(100*con4/total,1) if total else 0)

    print(f"\n=== {nombre} (excluyendo {len(excluir)} ids estaticos: {sorted(excluir)}) ===")
    print(f"total_trackIds_reales: {n}")
    if n:
        print(f"duracion media: {statistics.mean(duraciones):.2f}s  mediana: {statistics.median(duraciones):.2f}s  max: {max(duraciones):.2f}s")
        print(f"tracks >2s: {sum(1 for x in duraciones if x>2)}  >5s: {sum(1 for x in duraciones if x>5)}  >10s: {sum(1 for x in duraciones if x>10)}")
    for W, (c4, tot, pct) in continuidad.items():
        print(f"  ventana {W}s: {c4}/{tot} ({pct}%) con 4+ jugadores REALES continuos")

for nombre, archivo in [('BASELINE A (buffer=30)', '/workspace/salidas/baselineA_clean.json'),
                         ('VARIANTE B (buffer=150)', '/workspace/salidas/test_buffer150.json')]:
    d, m = cargar(archivo)
    estaticos = detectar_estaticos(m)
    print(f"\n### {nombre}: {len(estaticos)} ids sospechosos de ser estaticos (rango<{UMBRAL_MOVIMIENTO_M}m) ###")
    for tid, rango, n in sorted(estaticos, key=lambda x:-x[2])[:8]:
        print(f"  id={tid}  rango_movimiento={rango:.2f}m  n_apariciones={n}")
    excluir = set(tid for tid,_,_ in estaticos)
    analizar(archivo, nombre, excluir)
