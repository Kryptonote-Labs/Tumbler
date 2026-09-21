#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Original six-second fixture with visible motion; no external footage or audio.
output=apps/docs/e2e/fixtures/presentation-video
font=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0xf5f7f3:s=960x540:r=30:d=6' \
  -vf "drawtext=fontfile=$font:text='Tumbler / video playback':x=64:y=70:fontsize=32:fontcolor=0x355f46,drawbox=x=80:y=282:w=800:h=4:color=0xdbe9de:t=fill,drawtext=fontfile=$font:text='●':x='60+760*t/6':y=238:fontsize=72:fontcolor=0x355f46,drawtext=fontfile=$font:text='Six seconds of motion':x=64:y=440:fontsize=24:fontcolor=0x526557" \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "$output.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$output.mp4" -frames:v 1 -update 1 "$output.png"
