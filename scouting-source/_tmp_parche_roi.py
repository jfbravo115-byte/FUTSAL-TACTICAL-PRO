path = '/workspace/video_analyzer_roi.py'
with open(path) as f:
    content = f.read()

# Cambio 1: margen 0.5m + flag en_borde en el bloque in_meters, y en_borde=False en el else
old1 = '''            if not (-4.0 <= cx <= L + 4.0 and -4.0 <= cy <= W + 4.0):
                continue
            cx = min(max(cx, 0.0), L)
            cy = min(max(cy, 0.0), W)
        else:
            h, w = frame.shape[:2]
            cx = foot_x / w * 100.0
            cy = foot_y / h * 100.0'''
new1 = '''            ROI_MARGIN_M = 0.5  # experimento ROI v1: antes 4.0
            if not (-ROI_MARGIN_M <= cx <= L + ROI_MARGIN_M and -ROI_MARGIN_M <= cy <= W + ROI_MARGIN_M):
                continue
            en_borde = cx < 0.0 or cx > L or cy < 0.0 or cy > W  # necesito clamp para quedar dentro de rango
            cx = min(max(cx, 0.0), L)
            cy = min(max(cy, 0.0), W)
        else:
            en_borde = False
            h, w = frame.shape[:2]
            cx = foot_x / w * 100.0
            cy = foot_y / h * 100.0'''
assert old1 in content, "old1 no encontrado"
content = content.replace(old1, new1)

# Cambio 2: incluir el flag en el dict de tracks solo si es True
old2 = 'tracks.append({"id": int(tid), "x": cx, "y": cy, "team": stable_team, "gk": is_gk})'
new2 = '''track_dict = {"id": int(tid), "x": cx, "y": cy, "team": stable_team, "gk": is_gk}
            if en_borde:
                track_dict["borde"] = True
            tracks.append(track_dict)'''
assert old2 in content, "old2 no encontrado"
content = content.replace(old2, new2)

# Cambio 3: propagar el flag a las muestras (solo si True, para no inflar el JSON)
old3 = '''    def _store_sample(self, tracks, t):
        self.samples.append({
            "t": round(t, 1),
            "p": [
                {"id": tr["id"], "x": round(tr["x"], 1),
                 "y": round(tr["y"], 1), "eq": tr["team"][0]}  # l/r/d
                for tr in tracks
            ],
        })'''
new3 = '''    def _store_sample(self, tracks, t):
        def _punto(tr):
            p = {"id": tr["id"], "x": round(tr["x"], 1),
                 "y": round(tr["y"], 1), "eq": tr["team"][0]}  # l/r/d
            if tr.get("borde"):
                p["borde"] = True  # experimento ROI v1: quedo dentro del margen pero fuera de la pista real
            return p
        self.samples.append({
            "t": round(t, 1),
            "p": [_punto(tr) for tr in tracks],
        })'''
assert old3 in content, "old3 no encontrado"
content = content.replace(old3, new3)

with open(path, 'w') as f:
    f.write(content)
print("parche aplicado correctamente")
