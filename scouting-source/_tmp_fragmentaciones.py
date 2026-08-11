import json, math
from collections import defaultdict

def cargar(path):
    d = json.load(open(path))
    m = d['muestras']
    m.sort(key=lambda x: x['t'])
    return d, m

def vida_tracks(m):
    pos = defaultdict(list)
    for x in m:
        for j in x.get('p', []):
            pos[j['id']].append((x['t'], j['x'], j['y']))
    for tid in pos: pos[tid].sort()
    return pos

def candidatos_fragmentacion(m, max_gap_s=1.0, max_dist_m=2.5):
    pos = vida_tracks(m)
    finales = [(tid, pts[-1]) for tid, pts in pos.items()]   # (id, (t,x,y)) ultimo punto
    inicios = [(tid, pts[0]) for tid, pts in pos.items()]     # (id, (t,x,y)) primer punto
    candidatos = []
    for tidA, (tA, xA, yA) in finales:
        for tidB, (tB, xB, yB) in inicios:
            if tidA == tidB: continue
            dt = tB - tA
            if 0 < dt <= max_gap_s:
                dist = math.hypot(xB-xA, yB-yA)
                if dist <= max_dist_m:
                    candidatos.append({'idA': tidA, 'idB': tidB, 'tA_fin': tA, 'tB_inicio': tB,
                                        'gap_s': round(dt,2), 'dist_m': round(dist,2),
                                        'posA': (round(xA,1),round(yA,1)), 'posB': (round(xB,1),round(yB,1)),
                                        'dur_A': round(tA - pos[tidA][0][0], 1), 'dur_B': round(pos[tidB][-1][0]-tB,1)})
    candidatos.sort(key=lambda c: (c['gap_s'], c['dist_m']))
    return candidatos

d, m = cargar('/workspace/salidas/baselineA_clean.json')
cands = candidatos_fragmentacion(m)
print(f"total candidatos de fragmentacion (gap<=1s, dist<=2.5m): {len(cands)}")
for c in cands[:10]:
    print(c)
