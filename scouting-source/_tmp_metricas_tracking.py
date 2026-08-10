import json, sys, statistics
from collections import defaultdict

def analizar(path, nombre):
    d = json.load(open(path))
    m = d['muestras']
    m.sort(key=lambda x: x['t'])
    dur_video = d['video']['duracion_s']

    # timestep real observado (moda de las diferencias entre timestamps consecutivos)
    ts = [x['t'] for x in m]
    diffs = [round(ts[i+1]-ts[i], 2) for i in range(len(ts)-1)]
    step = statistics.mode(diffs) if diffs else 0.2

    vida = defaultdict(list)  # trackId -> lista de t donde aparece
    simultaneos = []
    for x in m:
        simultaneos.append(len(x.get('p', [])))
        for j in x.get('p', []):
            vida[j['id']].append(x['t'])

    duraciones = []
    fragmentaciones = []
    for tid, tlist in vida.items():
        tlist.sort()
        dur = tlist[-1] - tlist[0]
        duraciones.append(dur)
        if dur > 0:
            esperadas = round(dur / step) + 1
            frag = 1 - (len(tlist) / esperadas) if esperadas > 0 else 0
            fragmentaciones.append(max(0, frag))

    duraciones_sorted = sorted(duraciones)
    n = len(duraciones_sorted)
    def pct(p):
        if n == 0: return 0
        idx = min(n-1, int(p/100*n))
        return duraciones_sorted[idx]

    nuevos_por_min = n / (dur_video/60) if dur_video else 0

    # Metrica de continuidad (seccion 8): ventanas 5/10/20/30s, paso 1s,
    # cuenta cuantos ids aparecen en TODAS las muestras dentro de la ventana.
    continuidad = {}
    for W in [5, 10, 20, 30]:
        ventanas_con_4mas = 0
        total_ventanas = 0
        max_simul_continuos = 0
        t0 = ts[0] if ts else 0
        tfin = ts[-1] if ts else 0
        t = t0
        while t + W <= tfin:
            muestras_ventana = [x for x in m if t <= x['t'] <= t+W]
            if len(muestras_ventana) >= 2:
                sets = [set(j['id'] for j in x.get('p', [])) for x in muestras_ventana]
                comunes = set.intersection(*sets) if sets else set()
                total_ventanas += 1
                if len(comunes) >= 4:
                    ventanas_con_4mas += 1
                max_simul_continuos = max(max_simul_continuos, len(comunes))
            t += 1.0
        continuidad[W] = {
            'ventanas_con_4+': ventanas_con_4mas,
            'total_ventanas': total_ventanas,
            'pct': round(100*ventanas_con_4mas/total_ventanas, 1) if total_ventanas else 0,
            'max_ids_continuos_observado': max_simul_continuos
        }

    print(f"\n=== {nombre} ===")
    print(f"archivo: {path}  step_real: {step}s  duracion_video: {dur_video}s  n_muestras: {len(m)}")
    print(f"total_trackIds: {n}")
    print(f"duracion media: {statistics.mean(duraciones):.2f}s  mediana: {statistics.median(duraciones):.2f}s  p90: {pct(90):.2f}s  max: {max(duraciones):.2f}s" if n else "sin tracks")
    print(f"tracks >2s: {sum(1 for x in duraciones if x>2)}  >5s: {sum(1 for x in duraciones if x>5)}  >10s: {sum(1 for x in duraciones if x>10)}")
    print(f"nuevos IDs/min: {nuevos_por_min:.1f}")
    print(f"IDs simultaneos por muestra: media={statistics.mean(simultaneos):.2f}  max={max(simultaneos)}")
    print(f"fragmentacion media (tracks con hueco interno): {statistics.mean(fragmentaciones)*100:.1f}%" if fragmentaciones else "n/a")
    for W, c in continuidad.items():
        print(f"  ventana {W}s: {c['ventanas_con_4+']}/{c['total_ventanas']} ventanas con 4+ ids continuos ({c['pct']}%)  max_ids_continuos={c['max_ids_continuos_observado']}")
    return {'n': n, 'duraciones': duraciones, 'continuidad': continuidad, 'nuevos_por_min': nuevos_por_min, 'simultaneos': simultaneos}

r_a = analizar('/workspace/salidas/baselineA_clean.json', 'BASELINE A (buffer=30, original)')
r_b = analizar('/workspace/salidas/test_buffer150.json', 'VARIANTE B (buffer=150)')
