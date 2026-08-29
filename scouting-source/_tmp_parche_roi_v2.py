path = '/workspace/video_analyzer_roi.py'
with open(path) as f:
    lines = f.readlines()

# Buscar la linea exacta del if de tolerancia por CONTENIDO simple (no bloque completo)
idx_if = None
for i, l in enumerate(lines):
    if 'not (-4.0' in l and '<= cx <=' in l:
        idx_if = i
        break
assert idx_if is not None, "no se encontro la linea del if de tolerancia"
print("linea if encontrada en indice", idx_if, ":", repr(lines[idx_if]))

# Reemplazar esa linea por el nuevo margen + comentario
indent = lines[idx_if][:len(lines[idx_if]) - len(lines[idx_if].lstrip())]
lines[idx_if] = (
    indent + 'ROI_MARGIN_M = 0.5  # experimento ROI v1: antes 4.0\n' +
    indent + 'if not (-ROI_MARGIN_M <= cx <= L + ROI_MARGIN_M and -ROI_MARGIN_M <= cy <= W + ROI_MARGIN_M):\n'
)

# Buscar 'cy = min(max(cy, 0.0), W)' (deberia estar 3 lineas mas abajo del continue) para insertar el flag en_borde ANTES del clamp
idx_clampx = None
for i in range(idx_if, idx_if+6):
    if 'cx = min(max(cx, 0.0), L)' in lines[i]:
        idx_clampx = i
        break
assert idx_clampx is not None
indent2 = lines[idx_clampx][:len(lines[idx_clampx]) - len(lines[idx_clampx].lstrip())]
lines.insert(idx_clampx, indent2 + 'en_borde = cx < 0.0 or cx > L or cy < 0.0 or cy > W\n')

# Buscar el 'else:' que sigue (para in_meters/no in_meters) e insertar en_borde=False justo despues
idx_else = None
for i in range(idx_clampx, idx_clampx+6):
    if lines[i].strip() == 'else:':
        idx_else = i
        break
assert idx_else is not None
indent3 = lines[idx_else+1][:len(lines[idx_else+1]) - len(lines[idx_else+1].lstrip())]
lines.insert(idx_else+1, indent3 + 'en_borde = False\n')

with open(path, 'w') as f:
    f.writelines(lines)
print("Cambio 1 (ROI margin + en_borde) aplicado OK")
