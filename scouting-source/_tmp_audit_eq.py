import json
from collections import defaultdict

d = json.load(open('/workspace/salidas/81138bf302.json'))
m = d['muestras']
eq_por_id = defaultdict(list)  # id -> [(t, eq), ...]
for x in m:
    for j in x.get('p', []):
        eq_por_id[j['id']].append((x['t'], j['eq']))

cambios = []
for tid, lista in eq_por_id.items():
    lista.sort()
    eqs = [e for _, e in lista]
    unicos = set(eqs)
    if len(unicos) > 1:
        # cuenta transiciones reales (no solo variedad, sino cambios efectivos entre muestras consecutivas)
        n_transiciones = sum(1 for i in range(1, len(eqs)) if eqs[i] != eqs[i-1])
        cambios.append((tid, unicos, n_transiciones, len(lista), lista))

print(f"total_ids_con_eq_variable: {len(cambios)} de {len(eq_por_id)} ids totales")
cambios.sort(key=lambda c: -c[2])
for tid, unicos, n_trans, n_total, lista in cambios[:10]:
    print(f"\nid={tid}  valores_vistos={unicos}  transiciones={n_trans}/{n_total} muestras")
    print(f"  secuencia: {[(round(t,1), e) for t,e in lista[:15]]}")
