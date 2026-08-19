path = '/workspace/analizar_test.html'
with open(path) as f:
    content = f.read()

# 1. Insertar funciones de validacion + wireframe justo despues de solveH (buscamos el cierre de esa funcion)
marker = 'function solveH(src, dst) {'
assert marker in content, "no encontrado solveH"
idx = content.index(marker)
# buscar el cierre de la funcion (balance de llaves simple, asumiendo estilo consistente del archivo)
# en vez de parsear llaves, insertamos ANTES de la siguiente funcion declarada tras solveH
idx_derivar = content.index('function derivarEsquinas()')
assert idx_derivar > idx

nuevas_funciones = '''
// ── Guardia de calibracion (P0) ──────────────────────────────────
function calcularHomografiaActual() {
  const ids = ["p1", "p2", "p3", "p4"];
  const src = [], dst = [];
  for (const id of ids) {
    const tg = TARGETS.find(t2 => t2.id === id);
    const p = puntos[id];
    if (!p) return null;
    src.push(tg.opciones[tg.opcion || 0].court);
    dst.push([p.x, p.y]);
  }
  try {
    return solveH(src, dst);
  } catch (e) {
    return null;
  }
}

function validarCalibracion(H, anchoFrame, altoFrame) {
  if (!H) return { valido: false, motivo: 'Faltan puntos de calibracion.' };
  const esquinasMetros = [[0, 0], [40, 0], [40, 20], [0, 20]];
  const pxs = [];
  for (const [x, y] of esquinasMetros) {
    let px;
    try { px = H(x, y); } catch (e) { return { valido: false, motivo: 'Homografia no calculable (puntos casi colineales).' }; }
    if (!px || px.length !== 2 || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) {
      return { valido: false, motivo: 'Coordenadas no numericas (NaN/Infinity).' };
    }
    pxs.push(px);
  }
  // area del cuadrilatero proyectado (formula shoelace) - detecta area casi nula (degenerada)
  let area2 = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = pxs[i], [x2, y2] = pxs[(i + 1) % 4];
    area2 += x1 * y2 - x2 * y1;
  }
  const area = Math.abs(area2) / 2;
  if (area < 100) {
    return { valido: false, motivo: 'Area proyectada practicamente nula (calibracion degenerada).' };
  }
  // envolvente generosa: permite que una esquina real quede fuera de encuadre, pero rechaza casos extremos
  const xMin = -0.5 * anchoFrame, xMax = 1.5 * anchoFrame;
  const yMin = -0.5 * altoFrame, yMax = 1.5 * altoFrame;
  for (const [px, py] of pxs) {
    if (px < xMin || px > xMax || py < yMin || py > yMax) {
      return { valido: false, motivo: 'Vertice de la cancha proyectado muy lejos del encuadre (calibracion invalida).' };
    }
  }
  return { valido: true, motivo: '', esquinas: pxs };
}

function dibujarWireframeCancha(ctx, H) {
  const puntosCancha = [
    { pts: [[0, 0], [40, 0], [40, 20], [0, 20], [0, 0]], cerrado: true },   // contorno
    { pts: [[20, 0], [20, 20]], cerrado: false },                            // linea central
    { pts: [[6, 10]], cerrado: false, marcador: true },                     // penalti izq
    { pts: [[34, 10]], cerrado: false, marcador: true },                    // penalti der
    { pts: [[20, 10]], cerrado: false, marcador: true },                    // centro
  ];
  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = '#22c55e';
  ctx.lineWidth = 2;
  for (const grupo of puntosCancha) {
    const pxs = grupo.pts.map(([x, y]) => H(x, y));
    if (grupo.marcador) {
      const [px, py] = pxs[0];
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    pxs.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();
  }
  ctx.restore();
}

'''
content = content[:idx] + nuevas_funciones + content[idx:]

with open(path, 'w') as f:
    f.write(content)
print("PASO_1_funciones_insertadas_OK")

# --- PARTE 2: enganchar wireframe en dibujar() + mensaje de estado ---
with open(path) as f:
    content = f.read()

old_dibujar_end = '''function dibujar() {
  const cv = $('lienzo'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (frameImg) ctx.drawImage(frameImg, 0, 0, natW, natH);
  TARGETS.forEach(tg => {'''
new_dibujar_start = '''function dibujar() {
  const cv = $('lienzo'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (frameImg) ctx.drawImage(frameImg, 0, 0, natW, natH);
  const _H_preview = calcularHomografiaActual();
  let _calibInfo = { valido: false, motivo: 'Coloca los 4 puntos de pista.' };
  if (_H_preview) {
    _calibInfo = validarCalibracion(_H_preview, natW, natH);
    if (_calibInfo.valido) dibujarWireframeCancha(ctx, _H_preview);
  }
  actualizarMensajeCalibracion(_calibInfo);
  TARGETS.forEach(tg => {'''
assert content.count(old_dibujar_end) == 1, "no encontrado punto de enganche en dibujar()"
content = content.replace(old_dibujar_end, new_dibujar_start)

with open(path, 'w') as f:
    f.write(content)
print("PASO_2_hook_dibujar_OK")

# --- PARTE 3: funcion de mensaje + comprobarListo con validacion geometrica ---
with open(path) as f:
    content = f.read()

# 3a. Añadir elemento de mensaje en el HTML, justo antes del boton de analizar
old_btn = '<button class="btn primary big" id="btnAnalizar">⚡ ANALIZAR PARTIDO</button>'
assert content.count(old_btn) == 1
new_btn = '<div id="msgCalibracion" style="margin:8px 0;font-weight:600;"></div>\n    ' + old_btn
content = content.replace(old_btn, new_btn)

# 3b. Añadir funcion JS que actualiza ese mensaje (justo despues de dibujarWireframeCancha, la marca ya existe)
marker2 = 'function dibujar() {'
idx2 = content.index(marker2)
funcion_mensaje = '''function actualizarMensajeCalibracion(info) {
  const el = document.getElementById('msgCalibracion');
  if (!el) return;
  if (info.valido) {
    el.textContent = 'Revisa la calibracion: las lineas verdes deben coincidir con las lineas reales de la pista.';
    el.style.color = '#22c55e';
  } else {
    el.textContent = '\\u274c Calibracion invalida. Repite los puntos de pista. (' + info.motivo + ')';
    el.style.color = '#ef4444';
  }
}

'''
content = content[:idx2] + funcion_mensaje + content[idx2:]

# 3c. Modificar comprobarListo(): pistaOK ahora tambien exige calibracion geometrica valida
old_comprobar = '''  const pistaOK = ["p1", "p2", "p3", "p4"].every(id => puntos[id]);'''
new_comprobar = '''  const _Hchk = calcularHomografiaActual();
  const _calibChk = _Hchk ? validarCalibracion(_Hchk, natW, natH) : { valido: false };
  const pistaOK = ["p1", "p2", "p3", "p4"].every(id => puntos[id]) && _calibChk.valido;'''
assert content.count(old_comprobar) == 1, "no encontrado pistaOK original"
content = content.replace(old_comprobar, new_comprobar)

with open(path, 'w') as f:
    f.write(content)
print("PASO_3_mensaje_y_comprobarListo_OK")
