# pip install azure-cognitiveservices-speech azure-identity

import time

import azure.cognitiveservices.speech as speechsdk
from azure.identity import DefaultAzureCredential

SPEECH_ENDPOINT = "https://<resource-name>.cognitiveservices.azure.com"
SOURCE_LANGUAGE = "en-US"
TARGET_LANGUAGE = "fr"
TARGET_VOICE = "fr-FR-DeniseNeural"
INPUT_WAV = "input.wav"  # 16kHz mono 16-bit PCM; live mic capture omitted for simplicity
OUTPUT_WAV = "output.raw"  # translated speech, appended as it streams in

# 1. Authenticate and configure source -> target speech translation
translation_config = speechsdk.translation.SpeechTranslationConfig(
    endpoint=SPEECH_ENDPOINT, token_credential=DefaultAzureCredential()
)
translation_config.speech_recognition_language = SOURCE_LANGUAGE
translation_config.add_target_language(TARGET_LANGUAGE)
translation_config.voice_name = TARGET_VOICE
translation_config.set_speech_synthesis_output_format(
    speechsdk.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm
)
audio_config = speechsdk.audio.AudioConfig(filename=INPUT_WAV)
recognizer = speechsdk.translation.TranslationRecognizer(
    translation_config=translation_config, audio_config=audio_config
)

# 2. Wire up partial/final translation text events and the translated-speech audio event
done = False


def on_recognizing(evt: speechsdk.translation.TranslationRecognitionEventArgs) -> None:
    print(f"...{evt.result.translations.get(TARGET_LANGUAGE, '')}", end="\r")


def on_recognized(evt: speechsdk.translation.TranslationRecognitionEventArgs) -> None:
    print(f"Translated: {evt.result.translations.get(TARGET_LANGUAGE, '')}")


def on_synthesizing(evt: speechsdk.translation.TranslationSynthesisEventArgs) -> None:
    with open(OUTPUT_WAV, "ab") as f:
        f.write(bytes(evt.result.audio))


def stop(evt: speechsdk.SessionEventArgs) -> None:
    global done
    done = True


recognizer.recognizing.connect(on_recognizing)
recognizer.recognized.connect(on_recognized)
recognizer.synthesizing.connect(on_synthesizing)
recognizer.session_stopped.connect(stop)
recognizer.canceled.connect(stop)

# 3. Run continuous recognition/translation until the input audio is exhausted
recognizer.start_continuous_recognition()
while not done:
    time.sleep(0.5)
recognizer.stop_continuous_recognition()
