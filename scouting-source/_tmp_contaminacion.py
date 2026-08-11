import json
from collections import defaultdict

d = json.load(open('/workspace/salidas/81138bf302.json'))
L = d['pista']['largo_m']; W = d['pista']['ancho_m']
m = d['muestras']

pos = defaultdict(list)
for x in m:
    for j in x.get('p', []):
        pos[j['id']].append((x['t'], j['x'], j['y']))

EPS = 0.15  # tolerancia para considerar "exactamente en el borde"
sospechosos = []
for tid, pts in pos.items():
    pts.sort()
    n_borde = sum(1 for (t,x,y) in pts if x<=EPS or x>=L-EPS or y<=EPS or y>=W-EPS)
    frac_borde = n_borde / len(pts)
    dur = pts[-1][0] - pts[0][0]
    if frac_borde > 0.8 and len(pts) >= 3:  # >80% de sus apariciones en el borde exacto
        sospechosos.append((tid, frac_borde, n_borde, len(pts), dur, pts[0][0], pts[-1][0]))

sospechosos.sort(key=lambda s: -s[4])
total_muestras_afectadas = sum(s[2] for s in sospechosos)
total_muestras = sum(len(x.get('p',[])) for x in m)

print(f"=== Contaminacion fuera de pista (81138bf302.json, analisis REAL con color) ===")
print(f"tracks sospechosos (>80% de sus puntos en borde exacto, con >=3 apariciones): {len(sospechosos)}")
print(f"duracion acumulada de estos tracks: {sum(s[4] for s in sospechosos):.1f}s")
print(f"muestras-persona afectadas: {total_muestras_afectadas} de {total_muestras} totales ({100*total_muestras_afectadas/total_muestras:.1f}%)")
print(f"\nTop 15 por duracion:")
for tid, frac, nb, n, dur, t0, t1 in sospechosos[:15]:
    print(f"  id={tid}  dur={dur:.1f}s  frac_borde={frac*100:.0f}%  n={n}  t=[{t0:.1f},{t1:.1f}]")
