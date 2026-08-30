#!/bin/bash
# arranque.sh -- Futsal Commander Pro: enciende servidor + tunel con UN comando.
# Uso: cd /workspace && ./arranque.sh
set -u
cd /workspace || exit 10

echo "=== 1. Comprobando archivos criticos ==="
bad=0
for f in \
  /workspace/video_analyzer.py \
  /workspace/servidor_analisis.py \
  /workspace/botsort_lowconf_recovery.yaml \
  /workspace/cloudflared
do
  if [ -f "$f" ]; then
    echo "OK $f"
  else
    echo "FALTA $f"
    bad=1
  fi
done
[ "$bad" -eq 0 ] || { echo "ARRANQUE ABORTADO: faltan archivos criticos."; exit 12; }
chmod +x /workspace/cloudflared

echo "=== 2. Comprobando dependencias (sin reinstalar si ya estan) ==="
missing=""
python3 -c "import ultralytics" >/dev/null 2>&1 || missing="$missing ultralytics"
python3 -c "import cv2"         >/dev/null 2>&1 || missing="$missing opencv-python-headless"
python3 -c "import fastapi"     >/dev/null 2>&1 || missing="$missing fastapi"
python3 -c "import uvicorn"     >/dev/null 2>&1 || missing="$missing uvicorn"
python3 -c "import multipart"   >/dev/null 2>&1 || missing="$missing python-multipart"
if [ -n "$missing" ]; then
  echo "Instalando paquetes faltantes:$missing"
  python3 -m pip install --no-cache-dir $missing || { echo "FALLO instalando dependencias"; exit 20; }
else
  echo "Todas las dependencias ya estan presentes."
fi

echo "=== 3. Servidor FastAPI ==="
if curl -fsS http://127.0.0.1:8000/salud >/dev/null 2>&1; then
  echo "Servidor ya esta vivo y responde en /salud -- no se relanza."
else
  echo "Servidor no responde. (Re)lanzando..."
  if pgrep -f "[s]ervidor_analisis.py" >/dev/null; then
    pgrep -f "[s]ervidor_analisis.py" | xargs -r kill
    sleep 1
  fi
  : > /workspace/servidor_analisis.log
  nohup env PYTHONUNBUFFERED=1 python3 /workspace/servidor_analisis.py > /workspace/servidor_analisis.log 2>&1 &
  echo $! > /workspace/servidor_analisis.pid
  ok=0
  for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:8000/salud >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" -ne 1 ]; then
    echo "El servidor no arranco. Ultimas lineas de servidor_analisis.log:"
    tail -50 /workspace/servidor_analisis.log
    exit 30
  fi
  echo "Servidor arrancado correctamente."
fi

echo "=== 4. Tunel Cloudflare (solo el del proyecto, via PID) ==="
necesita_tunel=1
if [ -f /workspace/cloudflared.pid ]; then
  OLD=$(cat /workspace/cloudflared.pid 2>/dev/null || true)
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    OLD_ARGS=$(ps -p "$OLD" -o args= 2>/dev/null || true)
    case "$OLD_ARGS" in
      *"/workspace/cloudflared"*)
        if [ -f /workspace/url_actual.txt ] && curl -fsS "$(cat /workspace/url_actual.txt)/salud" >/dev/null 2>&1; then
          echo "Tunel del proyecto ya esta vivo y responde -- no se relanza."
          URL=$(cat /workspace/url_actual.txt)
          necesita_tunel=0
        fi
        ;;
    esac
  fi
fi

if [ "$necesita_tunel" -eq 1 ]; then
  if [ -f /workspace/cloudflared.pid ]; then
    OLD=$(cat /workspace/cloudflared.pid 2>/dev/null || true)
    if [ -n "$OLD" ]; then
      OLD_ARGS=$(ps -p "$OLD" -o args= 2>/dev/null || true)
      case "$OLD_ARGS" in
        *"/workspace/cloudflared"*) kill "$OLD" 2>/dev/null || true; sleep 1 ;;
      esac
    fi
  fi
  : > /workspace/cloudflared_mvp.log
  nohup /workspace/cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8000 > /workspace/cloudflared_mvp.log 2>&1 &
  echo $! > /workspace/cloudflared.pid
  URL=""
  for i in $(seq 1 30); do
    URL=$(grep -Eo "https://[-a-zA-Z0-9]+\.trycloudflare\.com" /workspace/cloudflared_mvp.log | tail -1)
    [ -n "$URL" ] && break
    sleep 1
  done
  if [ -z "$URL" ]; then
    echo "No se obtuvo la URL del tunel. Mira cloudflared_mvp.log"
    cat /workspace/cloudflared_mvp.log
    exit 40
  fi
  echo "$URL" > /workspace/url_actual.txt
fi

echo "=== 5. Verificando salud publica ==="
public_ok=0
for i in $(seq 1 20); do
  if curl -fsS "$URL/salud" >/dev/null 2>&1; then public_ok=1; break; fi
  sleep 1
done
if [ "$public_ok" -ne 1 ]; then
  echo "El tunel no responde en /salud publico."
  exit 41
fi

echo ""
echo "MVP_READY"
echo "SERVER=http://127.0.0.1:8000"
echo "PUBLIC_URL=$URL"
