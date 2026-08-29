path = '/workspace/video_analyzer_roi.py'
with open(path) as f:
    lines = f.readlines()

# Cambio 2: tracks.append -> incluir flag borde si en_borde
idx_append = None
for i, l in enumerate(lines):
    if 'tracks.append({"id": int(tid)' in l:
        idx_append = i
        break
assert idx_append is not None, "no encontrado tracks.append"
indent = lines[idx_append][:len(lines[idx_append]) - len(lines[idx_append].lstrip())]
lines[idx_append] = (
    indent + 'track_dict = {"id": int(tid), "x": cx, "y": cy, "team": stable_team, "gk": is_gk}\n' +
    indent + 'if en_borde:\n' +
    indent + '    track_dict["borde"] = True\n' +
    indent + 'tracks.append(track_dict)\n'
)

with open(path, 'w') as f:
    f.writelines(lines)
print("Cambio 2 (tracks.append con flag) aplicado en indice", idx_append)

# Cambio 3: _store_sample -> propagar flag a las muestras
with open(path) as f:
    lines = f.readlines()
idx_ss = None
for i, l in enumerate(lines):
    if 'def _store_sample' in l:
        idx_ss = i
        break
assert idx_ss is not None
# localizar el bloque completo del metodo (hasta la siguiente 'def ' al mismo nivel de indentacion)
idx_end = idx_ss + 1
while idx_end < len(lines) and not (lines[idx_end].strip().startswith('def ') and lines[idx_end].startswith('    def')):
    idx_end += 1

nuevo_metodo = '''    def _store_sample(self, tracks, t):
        def _punto(tr):
            p = {"id": tr["id"], "x": round(tr["x"], 1),
                 "y": round(tr["y"], 1), "eq": tr["team"][0]}  # l/r/d
            if tr.get("borde"):
                p["borde"] = True  # experimento ROI v1: dentro del margen pero fuera de pista real
            return p
        self.samples.append({
            "t": round(t, 1),
            "p": [_punto(tr) for tr in tracks],
        })

'''
lines[idx_ss:idx_end] = [nuevo_metodo]
with open(path, 'w') as f:
    f.writelines(lines)
print("Cambio 3 (_store_sample con flag) aplicado, reemplazado bloque", idx_ss, "a", idx_end)
