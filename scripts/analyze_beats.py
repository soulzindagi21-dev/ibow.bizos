"""
Analyse the tour's music track and write the beat map the auto-scroll tour uses.

    pip install librosa soundfile
    python scripts/analyze_beats.py public/tour/track.mp3 src/tour/beats.json [--suno scripts/suno-analysis.json]

Writes: duration, tempo, every beat time, the downbeats (first beat of each bar, assuming
4/4), and a 0..1 loudness for each bar. The tour lands every shape on a downbeat and uses
the bar loudness to pick fast transitions in loud parts and slow glides in quiet parts.

With --suno, the beat grid comes from Suno's own audio-analysis of the track (every beat with
its position in the bar, plus the song's sections), which is more reliable than detecting it,
especially through soft intros and outros. The song's outro (its last section) is written as
`finaleAt`, so the tour lands the closing logo there and the music ends naturally.
"""
import json
import sys

import librosa
import numpy as np


def main(src, out, suno=None, beats_per_bar=4):
    y, sr = librosa.load(src, sr=22050, mono=True)
    duration = len(y) / sr
    finale = None

    if suno:
        grid = json.load(open(suno))
        beats = np.array([b['time_s'] for b in grid['beats']])
        downbeats = np.array([b['time_s'] for b in grid['beats'] if b['bar_position'] == 1])
        tempo = grid.get('bpm') or 60 / np.median(np.diff(beats))
        secs = grid.get('sections') or []
        if len(secs) > 1 and 4 <= duration - secs[-1]['start_s'] <= 25:
            # land the closing logo on the downbeat nearest the outro's start
            finale = float(downbeats[np.argmin(np.abs(downbeats - secs[-1]['start_s']))])
        return write(out, src, y, sr, duration, tempo, beats, downbeats, finale)

    onset = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset, sr=sr, units='frames')
    beats = librosa.frames_to_time(beat_frames, sr=sr)
    if len(beats) < beats_per_bar * 2:
        sys.exit('Not enough beats found; is this a track with a steady beat?')

    # Downbeats: the bar position whose beats carry the most low-end punch (kick on the "one").
    low = librosa.onset.onset_strength(y=y, sr=sr, fmax=200, n_mels=32)
    strength = low[np.minimum(beat_frames, len(low) - 1)]
    phase = int(np.argmax([strength[p::beats_per_bar].mean() for p in range(beats_per_bar)]))
    downbeats = beats[phase::beats_per_bar]
    return write(out, src, y, sr, duration, tempo, beats, downbeats, finale)


def write(out, src, y, sr, duration, tempo, beats, downbeats, finale):
    # Loudness per bar (RMS), normalised 0..1 across the track.
    rms = librosa.feature.rms(y=y)[0]
    rms_t = librosa.times_like(rms, sr=sr)
    edges = list(downbeats) + [duration]
    bar_rms = [float(rms[(rms_t >= a) & (rms_t < b)].mean()) if b > a else 0.0 for a, b in zip(edges[:-1], edges[1:])]
    lo, hi = min(bar_rms), max(bar_rms)
    bar_energy = [round((v - lo) / (hi - lo), 3) if hi > lo else 0.5 for v in bar_rms]

    data = {
        'source': src.split('/')[-1],
        'duration': round(duration, 3),
        'bpm': round(float(np.atleast_1d(tempo)[0]), 2),
        'beats': [round(float(t), 3) for t in beats],
        'downbeats': [round(float(t), 3) for t in downbeats],
        'barEnergy': bar_energy,
    }
    if finale is not None:
        data['finaleAt'] = round(finale, 3)
    with open(out, 'w') as f:
        json.dump(data, f)
    print(f"{data['source']}: {data['duration']}s, {data['bpm']} bpm, {len(beats)} beats, "
          f"{len(downbeats)} bars, first downbeat at {downbeats[0]:.2f}s")


if __name__ == '__main__':
    args = sys.argv[1:]
    suno = None
    if '--suno' in args:
        i = args.index('--suno')
        suno = args[i + 1]
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1], suno)
