"""
Build the cue sheet the narrated tour runs on.

    python scripts/build_tour_cues.py scripts/narration-spans.json scripts/suno-narration-analysis.json src/tour/cues.json

Inputs, both from Suno for the tour soundtrack (public/tour/track.mp3):
  - narration-spans.json: when each stop's paragraph starts and ends (from Suno's word alignment);
  - suno-narration-analysis.json: Suno's audio-analysis of the track, i.e. every beat with its
    position in the bar.
The tour lands each shape on the downbeat (or failing that, the beat) nearest to the moment the
narrator starts that stop's paragraph, and moves during the pause before it.
"""
import json
import sys


def main(spans_path, analysis_path, out):
    spans = json.load(open(spans_path))['spans']
    a = json.load(open(analysis_path))
    beats = [round(b['time_s'], 3) for b in a['beats']]
    downbeats = [round(b['time_s'], 3) for b in a['beats'] if b['bar_position'] == 1]
    json.dump({
        'source': 'public/tour/track.mp3: Suno narration "iBow Business OS Tour - Narration (male)"',
        'duration': a['duration_s'],
        'bpm': a.get('bpm'),
        'paragraphs': [{'start': s, 'end': e} for s, e in spans],
        'beats': beats,
        'downbeats': downbeats,
    }, open(out, 'w'))
    print(f'{out}: {len(spans)} paragraphs, {len(beats)} beats, {len(downbeats)} downbeats, {a["duration_s"]}s')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
