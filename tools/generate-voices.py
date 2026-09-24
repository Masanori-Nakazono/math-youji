#!/usr/bin/env python3
"""Build offline VOICEVOX Nemo packs from the app's speech corpus.

Install voicevox_core 0.17.0 and imageio-ffmpeg in a separate virtualenv; point
--runtime at the official downloader's output. See src/voices/README.md.
Only the resulting audio, manifest and license notice are shipped to users.
"""

import argparse
import concurrent.futures
import hashlib
import io
from importlib.metadata import version
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parent.parent
VOICES = [
    {"id": "nemo-female1", "name": "やさしい声（女声1）", "description": "やわらかく、親しみやすい声", "styleId": 10005},
    {"id": "nemo-female2", "name": "はっきりした声（女声2）", "description": "明るく、はっきり聞こえる声", "styleId": 10007},
    {"id": "nemo-male1", "name": "おだやかな声（男声1）", "description": "落ち着いた、低めの声", "styleId": 10001},
]
CONFIG = {"core": "0.17.0", "model": "0.16.3/n0.vvm", "speed": 0.95,
          "sampleRate": 24000, "bitrate": "48k", "prePause": 0.06, "postPause": 0.12,
          "encodingVersion": 1}


def phrase_key(text):
    return re.sub(r"[。！？!?]+$", "", re.sub(r"\s+", "", text))


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as target:
        target.write(data)
        temporary = Path(target.name)
    temporary.replace(path)


def generate_voice(voice, phrases, runtime, output, cache, threads):
    from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile
    import imageio_ffmpeg

    runtime, output, cache = Path(runtime), Path(output), Path(cache)
    libraries = list((runtime / "onnxruntime/lib").glob("*voicevox_onnxruntime*"))
    libraries = [p for p in libraries if p.suffix in (".dylib", ".dll") or ".so" in p.name]
    if not libraries:
        raise RuntimeError("VOICEVOX ONNX Runtime library not found in " + str(runtime))
    synthesizer = Synthesizer(Onnxruntime.load_once(filename=str(sorted(libraries)[0])),
                             OpenJtalk(runtime / "dict/open_jtalk_dic_utf_8-1.11"),
                             acceleration_mode="CPU", cpu_num_threads=threads)
    with VoiceModelFile.open(runtime / "models/vvms/n0.vvm") as model:
        synthesizer.load_voice_model(model)
    encoder = imageio_ffmpeg.get_ffmpeg_exe()
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    offsets, offset, reused = {}, 0, 0
    started = time.monotonic()
    pack_temp = output / (voice["id"] + ".tmp")
    try:
        with pack_temp.open("wb") as pack:
            for index, phrase in enumerate(phrases):
                cache_key = hashlib.sha256(json.dumps(
                    {"config": CONFIG, "style": voice["styleId"], "text": phrase["text"]},
                    sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                clip_file = cache / (cache_key + ".mp3")
                if clip_file.exists():
                    encoded = clip_file.read_bytes()
                    reused += 1
                else:
                    query = synthesizer.create_audio_query(phrase["text"], voice["styleId"])
                    query.speed_scale = CONFIG["speed"]
                    query.pre_phoneme_length = CONFIG["prePause"]
                    query.post_phoneme_length = CONFIG["postPause"]
                    query.output_sampling_rate = CONFIG["sampleRate"]
                    query.output_stereo = False
                    wav = synthesizer.synthesis(query, voice["styleId"])
                    with wave.open(io.BytesIO(wav)) as audio:
                        if audio.getnframes() < 1200 or audio.getnchannels() != 1:
                            raise RuntimeError("Unexpected generated audio for " + phrase["key"])
                    encoded = subprocess.run([
                        encoder, "-v", "error", "-nostdin", "-i", "pipe:0", "-map_metadata", "-1",
                        "-ac", "1", "-ar", str(CONFIG["sampleRate"]), "-c:a", "libmp3lame",
                        "-b:a", CONFIG["bitrate"], "-write_xing", "0", "-f", "mp3", "pipe:1"
                    ], input=wav, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
                    if len(encoded) < 100:
                        raise RuntimeError("Empty encoded audio for " + phrase["key"])
                    atomic_write(clip_file, encoded)
                offsets[phrase["key"]] = [offset, len(encoded)]
                pack.write(encoded)
                offset += len(encoded)
                if (index + 1) % 100 == 0 or index + 1 == len(phrases):
                    print(f"{voice['id']}: {index + 1}/{len(phrases)} ({reused} cached), "
                          f"{time.monotonic() - started:.0f}s, {offset / 1048576:.1f} MiB", flush=True)
        with pack_temp.open("rb") as generated:
            digest = hashlib.file_digest(generated, "sha256").hexdigest()
        filename = voice["id"] + "-" + digest[:12] + ".bin"
        pack_temp.replace(output / filename)
        return {**voice, "file": "voices/" + filename, "bytes": offset,
                "sha256": digest, "clips": offsets}
    finally:
        pack_temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, default=ROOT / "src/voices/phrases.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/voices")
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "math-youji-voice-cache")
    parser.add_argument("--jobs", type=int, default=3)
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    if version("voicevox-core") != CONFIG["core"] or version("imageio-ffmpeg") != "0.6.0":
        raise RuntimeError("Use voicevox-core 0.17.0 and imageio-ffmpeg 0.6.0 so cached audio stays reproducible")
    corpus = json.loads(args.corpus.read_text())
    phrases = sorted(corpus["phrases"], key=lambda p: p["key"])
    if not phrases or len({p["key"] for p in phrases}) != len(phrases):
        raise ValueError("Speech corpus must contain unique nonempty phrases")
    for phrase in phrases:
        if not phrase["key"] or phrase["key"] != phrase_key(phrase["text"]):
            raise ValueError("Invalid corpus key: " + str(phrase))
    print(f"Generating {len(phrases)} phrases in {len(VOICES)} voices", flush=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=max(1, min(args.jobs, len(VOICES)))) as workers:
        futures = [workers.submit(generate_voice, voice, phrases, args.runtime, args.output,
                                  args.cache, max(1, args.threads)) for voice in VOICES]
        voices = [future.result() for future in futures]
    manifest = {"version": 1, "credit": "VOICEVOX Nemo", "generation": CONFIG, "voices": voices}
    atomic_write(args.output / "manifest.json", (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
    print("Wrote " + str(args.output / "manifest.json"), flush=True)


if __name__ == "__main__":
    main()
