#!/bin/bash
# Encodes the captured frames to the landing video (mp4 + webm) and a poster.
set -e
V=$1; OUT=$2
ffmpeg -y -loglevel error -f concat -safe 0 -i $V/frames.txt -vf "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 24 -movflags +faststart -an $OUT/overwatch-tour.mp4
ffmpeg -y -loglevel error -i $OUT/overwatch-tour.mp4 -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -an $OUT/overwatch-tour.webm
ffmpeg -y -loglevel error -ss 1.5 -i $OUT/overwatch-tour.mp4 -frames:v 1 -vf "scale=1280:720" -q:v 3 $OUT/overwatch-tour-poster.jpg
ls -la $OUT/overwatch-tour*
ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/overwatch-tour.mp4
