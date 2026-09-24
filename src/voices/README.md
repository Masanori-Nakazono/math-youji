# 自然な日本語の声

このディレクトリには **VOICEVOX Nemo** で事前生成した日本語の音声が入っています。
音声提供元: [VOICEVOX Nemo](https://voicevox.hiroshiba.jp/nemo/)

アプリは事前生成した音声ファイルを再生します。API キー、クラウド音声サービス、
利用者の端末への音声合成モデルのインストールは不要です。選択した声を端末に保存すると、
次回からオフラインでも再生できます。

## クレジット・利用条件

**音声: VOICEVOX Nemo（女声1・女声2・男声1）**

この音声の利用には [VOICEVOX Nemo 利用規約](https://voicevox.hiroshiba.jp/nemo/term/) が適用されます。
生成音声はクレジットを明示して商用・非商用で利用できます。再利用・再配布の際も
「VOICEVOX Nemo」のクレジットを表示し、利用者に同規約の遵守を求めてください。
音声の機械学習への利用、権利侵害、著作情報を偽る利用などは同規約で禁止されています。
この音声ファイルには、アプリのプログラムと同じライセンスを一律に適用しないでください。

アプリの設定画面にも提供元と利用規約を表示します。音声合成モデルおよび
VOICEVOX ONNX Runtime は開発時だけ使用し、アプリには同梱していません。

## 再生成

Python 3.11 以降と、公式の VOICEVOX CORE 0.17.0 / Nemo 音声モデル 0.16.3 を使用します。
モデルの `n0.vvm` には Nemo の全話者が入っています。このアプリでは
女声1（style ID 10005）、女声2（10007）、男声1（10001）を使用します。

公式配布元:

- [VOICEVOX CORE 0.17.0](https://github.com/VOICEVOX/voicevox_core/releases/tag/0.17.0)
- [音声モデル 0.16.3](https://github.com/VOICEVOX/voicevox_vvm/releases/tag/0.16.3)
- [公式 Python サンプル](https://github.com/VOICEVOX/voicevox_core/tree/0.17.0/example/python)
- [モデルと話者 ID](https://github.com/VOICEVOX/voicevox_vvm/blob/0.16.3/README.md)

macOS Apple Silicon の例（他の OS では配布ファイル名を変更）:

```sh
python3 -m venv /tmp/math-youji-voicevox/venv
/tmp/math-youji-voicevox/venv/bin/python -m pip install \
  https://github.com/VOICEVOX/voicevox_core/releases/download/0.17.0/voicevox_core-0.17.0-cp310-abi3-macosx_11_0_arm64.whl \
  imageio-ffmpeg==0.6.0
curl -fL https://github.com/VOICEVOX/voicevox_core/releases/download/0.17.0/download-osx-arm64 \
  -o /tmp/math-youji-voicevox/download
chmod +x /tmp/math-youji-voicevox/download
/tmp/math-youji-voicevox/download --only onnxruntime models dict \
  --models-pattern n0.vvm --models-version 0.16.3 \
  --onnxruntime-version 1.17.3 -o /tmp/math-youji-voicevox/runtime

# 公式ダウンローダーで利用規約を確認してから実行する。
/tmp/math-youji-voicevox/venv/bin/python tools/generate-voices.py \
  --runtime /tmp/math-youji-voicevox/runtime
```

`phrases.json` はアプリの読み上げ文を集めたコーパスです。`text` は生成時に読む文、
`key` は全空白と末尾の句点・疑問符・感嘆符を取り除いた照合用文字列です。
新しい読み上げ文を追加したときはコーパスと音声を再生成してください。
音声が見つからない文には端末の日本語読み上げを使用します。

Playwright / Chromium を用意した開発環境で、コーパスの更新と画面操作からの照合ができます。

```sh
node tools/collect-speech.cjs
node tools/audit-speech.cjs
```

コーパスを更新してから上記の音声生成コマンドを実行し、`bash build.sh` で配布用ファイルを作成します。

生成済みの一文ごとの MP3 は OS の一時ディレクトリ内の `math-youji-voice-cache` に保存され、
再実行時は再利用されます（保存先は `--cache` で指定可能）。
キャッシュキーには文・話者 ID・生成設定を含みます。3 話者を並行生成し、
`--jobs 1 --threads 4` などでメモリ・CPU 使用量を調整できます。

## ファイル形式

- `manifest.json`: 声の表示名、SHA-256、ファイルサイズ、一文ごとのバイト範囲。
- `nemo-*-<sha256 の先頭12桁>.bin`: 24 kHz / mono / 48 kbps の独立した MP3 を連結。
  各クリップは完全な MP3 なので、manifest の範囲を切り出し Web Audio でデコードできます。
- `phrases.json`: 再生成用の文一覧。

ハッシュ付きのファイル名は更新前の音声キャッシュと混ざることを防ぎます。
音声合成では速さを 0.95 に設定し、声本来の高さと抑揚を維持しています。
