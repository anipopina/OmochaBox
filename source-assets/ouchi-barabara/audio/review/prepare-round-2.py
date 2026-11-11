"""Create the second listening round from the first round's sound colours."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from scipy.io.wavfile import read, write
from scipy.signal import resample_poly, butter, sosfilt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    project = base.parents[3]
    outputs = project / 'src/ouchi-barabara/sound-review/assets'
    cases = [
        ('collapse-d', outputs/'collapse-original.mp3', .66, 1.80, 1., 0., 2.4),
        ('collapse-e', outputs/'collapse-original.mp3', .88, 1.78, 1., 0., 3.0),
        ('rubble-d', outputs/'rubble-b.mp3', 0., .65, .94, .12, 0.),
        ('rubble-e', outputs/'rubble-b.mp3', 0., .65, .90, .18, 0.),
    ]
    records = []
    with tempfile.TemporaryDirectory() as temporary:
        for cue, source, start, end, speed, tail, decay in cases:
            decoded = Path(temporary)/'input.wav'
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(source),'-ar','32000','-ac','1','-c:a','pcm_f32le',str(decoded)],check=True)
            sr, samples = read(decoded)
            reference_rms = float(np.sqrt(np.mean(samples**2)))
            audio = samples[int(start*sr):int(end*sr)].astype(np.float64)
            if decay:
                audio *= np.exp(-decay*np.arange(len(audio))/len(audio))
            else:
                audio = resample_poly(audio,100,int(speed*100))
                audio = sosfilt(butter(2,4500 if speed==.94 else 3500,fs=sr,output='sos'),audio)
                dry = audio.copy()
                audio = np.pad(audio,(0,int(tail*sr)))
                for delay, gain in [(.045,.08),(.09,.03)]:
                    offset=int(delay*sr)
                    audio[offset:offset+len(dry)] += dry*gain
            attack=int(.006*sr); release=int(.06*sr)
            audio[:attack] *= np.linspace(0,1,attack)
            audio[-release:] *= np.linspace(1,0,release)
            audio *= min(reference_rms/np.sqrt(np.mean(audio**2)),.28/np.max(np.abs(audio)))
            processed=Path(temporary)/'processed.wav'
            write(processed,sr,audio.astype(np.float32))
            output=outputs/f'{cue}.mp3'
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(processed),'-c:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(output)],check=True)
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(output),'-c:a','pcm_f32le',str(decoded)],check=True)
            rate, final=read(decoded)
            assert np.isfinite(final).all() and 0<np.max(np.abs(final))<.4
            window=int(.05*rate)
            levels=[float(np.sqrt(np.mean(final[i:i+window]**2))) for i in range(0,len(final),window)]
            if decay:
                assert max(levels[:len(levels)//4])>max(levels[len(levels)//2:]),cue
            records.append(dict(id=cue,source=source.relative_to(project).as_posix(),
                source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                output=output.relative_to(project).as_posix(),output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                bytes=output.stat().st_size,cut_seconds=[start,end],speed=speed,tail_seconds=tail,
                exponential_decay=decay,duration_seconds=len(final)/rate,sample_rate=rate,channels=1,
                decoded_peak_dbfs=20*np.log10(float(np.max(np.abs(final)))),
                decoded_rms_dbfs=20*np.log10(float(np.sqrt(np.mean(final**2)))),rms_50ms=levels))
    (base/'round-2-optimization.json').write_text(json.dumps({'derived_on':'2026-11-11','selection':'selections/2026-11-11-v1.json','cues':records},indent=2)+'\n')
    for row in records: print(row['id'],round(row['duration_seconds'],3),'seconds',row['bytes'],'bytes')


if __name__=='__main__':
    main()
