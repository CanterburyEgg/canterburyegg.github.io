#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
CADENZA_DIR="${SCRIPT_DIR:h}"

# Prefer local cadenza/.venv if created, otherwise use cached ML environment if available
if [[ -x "${CADENZA_DIR}/.venv/bin/python" ]]; then
  PY="${CADENZA_DIR}/.venv/bin/python"
elif [[ -x "/Users/bmyersmorgan/.gemini/jetski/brain/3314bb46-41da-46a1-9c00-38f8f6fefd8e/scratch/venv/bin/python" ]]; then
  PY="/Users/bmyersmorgan/.gemini/jetski/brain/3314bb46-41da-46a1-9c00-38f8f6fefd8e/scratch/venv/bin/python"
else
  echo "Creating local Python ML environment at ${CADENZA_DIR}/.venv..."
  python3 -m venv --system-site-packages "${CADENZA_DIR}/.venv"
  "${CADENZA_DIR}/.venv/bin/pip" install onnxruntime demucs soundfile librosa pretty_midi resampy
  "${CADENZA_DIR}/.venv/bin/pip" install --no-deps basic-pitch==0.4.0
  PY="${CADENZA_DIR}/.venv/bin/python"
fi

exec "${PY}" "${SCRIPT_DIR}/analyze_track.py" "$@"
