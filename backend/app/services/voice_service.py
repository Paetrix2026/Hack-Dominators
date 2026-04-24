import whisper
from deep_translator import GoogleTranslator

model = whisper.load_model("base")


def process_voice(file_path):

    # 🎤 Speech to text
    result = model.transcribe(file_path)
    original_text = result["text"]

    # 🌐 Kannada → English
    translated_text = GoogleTranslator(
        source='auto',
        target='en'
    ).translate(original_text)

    return {
        "original_text": original_text,
        "translated_text": translated_text
    }