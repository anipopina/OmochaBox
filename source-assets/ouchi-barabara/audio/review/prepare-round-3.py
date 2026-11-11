"""Preserve collapse A's opening texture, then let it settle over two seconds."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from scipy.io.wavfile import read, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    project = base.parents[3]
    assets = project/'src/ouchi-barabara/sound-review/assets'
    source = assets/'collapse-original.mp3'
    records = []
    with tempfile.TemporaryDirectory() as temporary:
        decoded = Path(temporary)/'decoded.wav'
        subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(source),'-ar','32000','-ac','1','-c:a','pcm_f32le',str(decoded)],check=True)
        rate, original = read(decoded)
        for cue, duration, decay, strength in [('collapse-f',2.,1.6,1.),('collapse-g',2.,2.3,1.),('crumble-a',1.5,1.8,.82),('crumble-b',1.5,2.6,.78)]:
            audio=original[:int(duration*rate)].astype(np.float64)
            # Limit later, louder clacks to a falling envelope without raising
            # the quiet gaps or shifting away from A's opening sounds.
            window=int(.05*rate)
            levels=np.array([np.sqrt(np.mean(audio[i:i+window]**2)) for i in range(0,len(audio),window)])
            reference=max(levels[:5])
            times=np.arange(len(levels))*.05
            gains=np.minimum(1,reference*np.exp(-decay*times/duration)/np.maximum(levels,1e-8))
            audio*=np.interp(np.arange(len(audio))/rate,times,gains)
            attack=int(.006*rate); release=int(.2*rate)
            audio[:attack]*=np.linspace(0,1,attack)
            audio[-release:]*=np.linspace(1,0,release)
            audio*=.28/max(np.max(np.abs(audio)),1e-8)*strength
            processed=Path(temporary)/'processed.wav'
            write(processed,rate,audio.astype(np.float32))
            output=assets/f'{cue}.mp3'
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(processed),'-c:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(output)],check=True)
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(output),'-c:a','pcm_f32le',str(decoded)],check=True)
            sr, final=read(decoded)
            assert np.isfinite(final).all() and 0<np.max(np.abs(final))<.4
            rms=[float(np.sqrt(np.mean(final[i:i+window]**2))) for i in range(0,len(final),window)]
            assert max(rms[:len(rms)//3])>max(rms[-len(rms)//3:])
            records.append(dict(id=cue,source=source.relative_to(project).as_posix(),
                source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                output=output.relative_to(project).as_posix(),output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                bytes=output.stat().st_size,cut_seconds=[0,duration],opening_reference_seconds=.25,
                envelope_decay=decay,strength=strength,fade_seconds=[.006,.2],
                sample_rate=sr,channels=1,duration_seconds=len(final)/sr,
                decoded_peak_dbfs=20*np.log10(float(np.max(np.abs(final)))),
                decoded_rms_dbfs=20*np.log10(float(np.sqrt(np.mean(final**2)))),rms_50ms=rms))
    (base/'round-3-optimization.json').write_text(json.dumps({'derived_on':'2026-11-11','selection':'selections/2026-11-11-fixed-v1-selection-2.json','cues':records},indent=2)+'\n')
    for record in records: print(record['id'],record['duration_seconds'],'seconds',record['bytes'],'bytes')


if __name__=='__main__': main()
