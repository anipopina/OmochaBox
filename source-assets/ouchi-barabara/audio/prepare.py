"""Prepare generated WAVs for delivery; requires NumPy, SciPy and FFmpeg."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import shutil

import numpy as np
from scipy.io.wavfile import read, write
from scipy.signal import butter, sosfilt, resample_poly


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--review', action='store_true', help='Prepare comparison candidates only')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    project = base.parents[2]
    destination = project / 'src' / 'ouchi-barabara' / 'assets'
    # Short tails preserve each gesture's timing. The motor is deliberately
    # quieter than the impacts and ends at arrival rather than looping.
    settings = {
        'hit': (0.0, 0.7, -25, 0.005, 0.08),
        'collapse': (0.0, 2.1, -25, 0.005, 0.12),
        'rubble': (0.0, 0.65, -28, 0.005, 0.08),
        'drive': (0.0, 6.0, -33, 0.15, 0.3),
    }
    adopted_file = base / 'adopted.json'
    adopted = {} if args.review else json.loads(adopted_file.read_text())['cues']
    if args.review:
        current = {cue['id']: cue for cue in json.loads((base / 'review/baseline-optimization.json').read_text())['cues']}
        # Match each scene's current sample, rather than making a louder new
        # candidate seem preferable. Allow for the encoder's small level loss.
        settings = {cue: (values[0], values[1], current[cue]['decoded_rms_dbfs'] + 0.4,
                          values[3], values[4]) for cue, values in settings.items()}
        base = base / 'review'
        destination = project / 'src' / 'ouchi-barabara' / 'sound-review' / 'assets'
        settings = {f'{cue}-{letter}': values for cue, values in settings.items()
                    for letter in ['b', 'c']}
    records = []
    original_directory = project / json.loads((base / 'generation.json').read_text())['originals_directory']
    with tempfile.TemporaryDirectory() as temporary:
        for cue, (start, end, rms_db, attack, release) in settings.items():
            if cue in adopted:
                selection = adopted[cue]
                candidate = next(item for item in json.loads((base / selection['metadata']).read_text())['cues']
                                 if item['id'] == selection['candidate'])
                selected = project / selection['source']
                assert digest(selected) == candidate['output_sha256']
                output = destination / f'{cue}.mp3'
                shutil.copyfile(selected, output)
                records.append({**candidate, 'id': cue,
                                'source': selection['original'],
                                'output': output.relative_to(project).as_posix()})
                continue
            original = original_directory / f'{cue}.wav'
            rate, stereo = read(original)
            audio = stereo[int(start * rate):int(end * rate)].mean(axis=1)
            assert np.isfinite(audio).all()
            # Remove DC/rumble and soften the high end; avoid hard clipping
            # float model output, which can exceed the PCM full-scale range.
            audio = sosfilt(butter(2, 70, 'highpass', fs=rate, output='sos'), audio)
            audio = sosfilt(butter(2, 6500, 'lowpass', fs=rate, output='sos'), audio)
            rms = np.sqrt(np.mean(audio ** 2))
            assert rms > 0
            audio = np.tanh(audio / (4 * rms))
            envelope = np.ones(len(audio))
            n_attack = int(rate * attack)
            n_release = int(rate * release)
            envelope[:n_attack] = np.linspace(0, 1, n_attack)
            envelope[-n_release:] = np.linspace(1, 0, n_release)
            audio *= envelope
            scale = min(10 ** (rms_db / 20) / np.sqrt(np.mean(audio ** 2)),
                        10 ** ((-11 if args.review else -10) / 20) / np.max(np.abs(audio)))
            audio *= scale
            # Mono is sufficient for fixed-camera, non-spatial cues.
            audio = resample_poly(audio, 320, 441).astype(np.float32)
            processed = Path(temporary) / f'{cue}.wav'
            write(processed, 32000, audio)
            output = destination / f'{cue}.mp3'
            subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error',
                            '-y', '-i', str(processed), '-c:a', 'libmp3lame',
                            '-b:a', '64k', '-map_metadata', '-1', str(output)], check=True)
            # Measure decoded delivery audio, including codec overshoot.
            decoded = Path(temporary) / f'{cue}-decoded.wav'
            subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error',
                            '-y', '-i', str(output), '-c:a', 'pcm_f32le', str(decoded)], check=True)
            sr, samples = read(decoded)
            peak = float(np.max(np.abs(samples)))
            assert np.isfinite(samples).all() and 0 < peak < 0.4, (cue, peak)
            records.append(dict(id=cue, source=original.relative_to(project).as_posix(),
                                source_sha256=digest(original),
                                output=output.relative_to(project).as_posix(),
                                output_sha256=digest(output), bytes=output.stat().st_size,
                                cut_seconds=[start, end], target_rms_dbfs=rms_db,
                                fade_seconds=[attack, release], sample_rate=sr,
                                channels=1, duration_seconds=len(samples)/sr,
                                decoded_peak_dbfs=20*np.log10(peak),
                                decoded_rms_dbfs=20*np.log10(float(np.sqrt(np.mean(samples**2))))))
    version = subprocess.check_output([args.ffmpeg, '-version'], text=True).splitlines()[0]
    (base / 'optimization.json').write_text(json.dumps(dict(ffmpeg=version, cues=records), indent=2)+'\n')
    for record in records:
        print(record['id'], record['bytes'], 'bytes', round(record['decoded_peak_dbfs'], 1), 'dBFS peak')


if __name__ == '__main__':
    main()
