#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
CADENZA_DIR="${SCRIPT_DIR:h}"

if [[ -x "${CADENZA_DIR}/.venv/bin/python" ]]; then
  PY="${CADENZA_DIR}/.venv/bin/python"
elif [[ -x "/Users/bmyersmorgan/.gemini/jetski/brain/3314bb46-41da-46a1-9c00-38f8f6fefd8e/scratch/venv/bin/python" ]]; then
  PY="/Users/bmyersmorgan/.gemini/jetski/brain/3314bb46-41da-46a1-9c00-38f8f6fefd8e/scratch/venv/bin/python"
else
  echo "Creating local Python environment at ${CADENZA_DIR}/.venv..."
  python3 -m venv --system-site-packages "${CADENZA_DIR}/.venv"
  "${CADENZA_DIR}/.venv/bin/pip" install soundfile librosa pretty_midi scipy numpy
  PY="${CADENZA_DIR}/.venv/bin/python"
fi

# If called with explicit <audio> <score>, sync that pair directly;
# otherwise auto-discover matching pairs across cadenza/audio/ and cadenza/scores/!
if [[ $# -ge 2 ]]; then
  exec "${PY}" "${SCRIPT_DIR}/sync_score.py" "$@"
fi

SCORES_DIR="${CADENZA_DIR}/scores"
AUDIO_DIR="${CADENZA_DIR}/audio"
FOUND=0

for score_file in "${SCORES_DIR}"/*.(mid|midi|mscz|mscx|mxl|musicxml|xml|pdf)(N); do
  stem="${score_file:t:r}"
  for audio_file in "${AUDIO_DIR}/${stem}".(mp3|m4a|flac|wav|ogg)(N); do
    FOUND=1
    "${PY}" "${SCRIPT_DIR}/sync_score.py" "${audio_file}" "${score_file}"
    break
  done
done

if [[ "${FOUND}" -eq 0 ]]; then
  echo "Usage: ./cadenza/scripts/sync.sh <audio-file> <score-file (.mid|.mscz|.mxl|.musicxml)>"
  echo "   or drop matching score files into cadenza/scores/<track-name>.(mid|mscz|mxl) and run ./cadenza/scripts/sync.sh"
fi
