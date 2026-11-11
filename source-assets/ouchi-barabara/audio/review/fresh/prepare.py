"""Compress freshly generated, unreferenced block cascades for comparison."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from scipy.io.wavfile import read, write
from scipy.signal import butter, sosfilt, resample_poly, find_peaks


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    args=parser.parse_args()
    base=Path(__file__).resolve().parent
    project=base.parents[4]
    destination=project/'src/ouchi-barabara/sound-review/assets'
    generation=json.loads((base/'generation.json').read_text())
    records=[]
    with tempfile.TemporaryDirectory() as temporary:
        for cue in generation['cues']:
            original=project/generation['originals_directory']/f"{cue['id']}.wav"
            sr,stereo=read(original)
            audio=stereo.mean(axis=1).astype(np.float64)
            assert np.isfinite(audio).all()
            audio=sosfilt(butter(2,65,'highpass',fs=sr,output='sos'),audio)
            audio=sosfilt(butter(2,6500,'lowpass',fs=sr,output='sos'),audio)
            # Preserve the generated event. Only smooth its file boundaries;
            # don't recycle, rearrange or stretch another candidate's sounds.
            attack=int(.005*sr);release=int(.08*sr)
            audio[:attack]*=np.linspace(0,1,attack)
            audio[-release:]*=np.linspace(1,0,release)
            target=-28 if cue['id'].startswith('collapse') else -31
            audio*=min(10**(target/20)/np.sqrt(np.mean(audio**2)),.28/np.max(np.abs(audio)))
            audio=resample_poly(audio,320,441).astype(np.float32)
            processed=Path(temporary)/'processed.wav'
            write(processed,32000,audio)
            output=destination/f"{cue['id']}.mp3"
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(processed),'-c:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(output)],check=True)
            decoded=Path(temporary)/'decoded.wav'
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(output),'-c:a','pcm_f32le',str(decoded)],check=True)
            rate,final=read(decoded)
            assert np.isfinite(final).all() and 0<np.max(np.abs(final))<.4
            step=int(.02*rate)
            rms=np.array([np.sqrt(np.mean(final[i:i+step]**2)) for i in range(0,len(final),step)])
            peaks,_=find_peaks(rms,prominence=float(rms.max())*.22,distance=4)
            intervals=np.diff(peaks)*.02
            regular=bool(len(peaks)>=4 and intervals.std()/intervals.mean()<.2)
            records.append(dict(id=cue['id'],source=original.relative_to(project).as_posix(),
                source_sha256=hashlib.sha256(original.read_bytes()).hexdigest(),
                output=output.relative_to(project).as_posix(),output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                bytes=output.stat().st_size,sample_rate=rate,channels=1,duration_seconds=len(final)/rate,
                target_rms_dbfs=target,fade_seconds=[.005,.08],filter_hz=[65,6500],
                decoded_peak_dbfs=20*np.log10(float(np.max(np.abs(final)))),
                decoded_rms_dbfs=20*np.log10(float(np.sqrt(np.mean(final**2)))),
                rms_20ms=rms.tolist(),prominent_peak_seconds=(peaks*.02).tolist(),regular_peak_train_detected=regular))
    (base/'optimization.json').write_text(json.dumps({'cues':records},indent=2)+'\n')
    for cue in records:
        print(cue['id'], 'peaks=',cue['prominent_peak_seconds'],'regular=',cue['regular_peak_train_detected'],flush=True)


if __name__=='__main__': main()
