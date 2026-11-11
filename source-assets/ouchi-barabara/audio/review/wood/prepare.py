"""Prepare wooden-material generations and small weight variations of D."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
from scipy.io.wavfile import read, write
from scipy.signal import butter, sosfilt, resample_poly


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    args=parser.parse_args()
    base=Path(__file__).resolve().parent
    project=base.parents[4]
    assets=project/'src/ouchi-barabara/sound-review/assets'
    records=[]
    generation=json.loads((base/'generation.json').read_text())
    cases=[(row['id'],project/generation['originals_directory']/f"{row['id']}.wav",row['seconds'],1.,0.) for row in generation['cues']]
    cases += [('crumble-f',assets/'crumble-d.mp3',1.5,.97,.15),('crumble-g',assets/'crumble-d.mp3',1.5,.94,.25)]
    with tempfile.TemporaryDirectory() as temporary:
        for name,source,seconds,speed,weight in cases:
            if source.suffix=='.mp3':
                decoded=Path(temporary)/'source.wav'
                subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(source),'-ar','44100','-ac','2','-c:a','pcm_f32le',str(decoded)],check=True)
            else: decoded=source
            rate,samples=read(decoded)
            audio=samples.mean(axis=1).astype(np.float64)
            if speed!=1:audio=resample_poly(audio,100,int(speed*100))
            audio=audio[:round(seconds*rate)]
            audio=sosfilt(butter(2,65,'highpass',fs=rate,output='sos'),audio)
            if weight:audio += weight*sosfilt(butter(2,600,'lowpass',fs=rate,output='sos'),audio)
            audio=sosfilt(butter(2,6500,'lowpass',fs=rate,output='sos'),audio)
            attack=int(.005*rate);release=int(.08*rate)
            audio[:attack]*=np.linspace(0,1,attack);audio[-release:]*=np.linspace(1,0,release)
            target=-28 if name.startswith('collapse') else -31
            audio*=min(10**(target/20)/np.sqrt(np.mean(audio**2)),.28/np.max(np.abs(audio)))
            audio=resample_poly(audio,320,441).astype(np.float32)
            processed=Path(temporary)/'processed.wav';write(processed,32000,audio)
            output=assets/f'{name}.mp3'
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(processed),'-c:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(output)],check=True)
            measured=Path(temporary)/'measured.wav'
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(output),'-c:a','pcm_f32le',str(measured)],check=True)
            sr,final=read(measured)
            assert np.isfinite(final).all() and 0<np.max(np.abs(final))<.4
            records.append(dict(id=name,source=source.relative_to(project).as_posix(),
                source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                output=output.relative_to(project).as_posix(),output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                bytes=output.stat().st_size,duration_seconds=len(final)/sr,sample_rate=sr,channels=1,
                speed=speed,low_band_hz=600,low_band_gain=weight,target_rms_dbfs=target,
                fade_seconds=[.005,.08],filter_hz=[65,6500],
                decoded_peak_dbfs=20*np.log10(float(np.max(np.abs(final)))),
                decoded_rms_dbfs=20*np.log10(float(np.sqrt(np.mean(final**2))))))
    (base/'optimization.json').write_text(json.dumps({'selection':'../selections/2026-11-11-fixed-v1-selection-3.json','cues':records},indent=2)+'\n')
    for row in records:print(row['id'],row['duration_seconds'],'seconds',row['bytes'],'bytes')


if __name__=='__main__':main()
