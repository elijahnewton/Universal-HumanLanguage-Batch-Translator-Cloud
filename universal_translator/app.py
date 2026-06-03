import os
import time
import uuid
import threading
from datetime import datetime
from pathlib import Path

from boto3.session import Session
from deep_translator import GoogleTranslator
from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
ALLOWED_EXTENSIONS = {"txt"}
BATCH_SIZE = 30
RATE_LIMIT = 1

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH", str(25 * 1024 * 1024)))
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-this-secret-key")

TASKS = {}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_r2_client():
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    access_key_id = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID")
    secret_access_key = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    bucket_name = os.getenv("CLOUDFLARE_R2_BUCKET")

    if not all([account_id, access_key_id, secret_access_key, bucket_name]):
        return None, None

    session = Session(
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name="auto",
    )
    client = session.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
    )
    return client, bucket_name


def get_r2_upload_key(filename: str) -> str:
    return f"uploads/{filename}"


def get_r2_output_key(filename: str) -> str:
    return f"outputs/{filename}"


def save_to_r2(local_path: Path, object_key: str) -> None:
    client, bucket_name = get_r2_client()
    if client is None:
        return
    client.upload_file(str(local_path), bucket_name, object_key)


def download_from_r2(local_path: Path, object_key: str) -> bool:
    client, bucket_name = get_r2_client()
    if client is None:
        return False
    try:
        client.download_file(bucket_name, object_key, str(local_path))
        return True
    except Exception:
        return False


def async_translation_worker(task_id: str, filename: str, input_path: Path, output_path: Path, output_r2_key: str, source_lang: str, target_lang: str):
    """Function runs entirely inside a background thread with dynamic languages."""
    try:
        # Dynamically set source and target language codes
        translator = GoogleTranslator(source=source_lang, target=target_lang)

        with input_path.open("r", encoding="utf-8") as f:
            all_phrases = [line.strip() for line in f if line.strip()]

        total_phrases = len(all_phrases)
        lines_already_done = 0

        if output_path.exists():
            with output_path.open("r", encoding="utf-8") as f:
                lines_already_done = sum(1 for _ in f)

        phrases_to_translate = all_phrases[lines_already_done:]

        if not phrases_to_translate:
            TASKS[task_id] = {"status": "complete", "progress": 100, "translated_file": f"translated_{filename}"}
            return

        TASKS[task_id]["progress"] = int((lines_already_done / total_phrases) * 100)
        translated_now = 0

        for i in range(0, len(phrases_to_translate), BATCH_SIZE):
            batch = phrases_to_translate[i : i + BATCH_SIZE]
            translations = translator.translate_batch(batch)

            with output_path.open("a", encoding="utf-8") as f:
                for original, translated in zip(batch, translations):
                    f.write(f"{original}\t{translated}\n")

            translated_now += len(batch)
            current_total_done = lines_already_done + translated_now
            
            TASKS[task_id]["progress"] = int((current_total_done / total_phrases) * 100)
            TASKS[task_id]["message"] = f"Translated {current_total_done}/{total_phrases} lines."

            time.sleep(RATE_LIMIT)

        save_to_r2(output_path, output_r2_key)
        TASKS[task_id] = {
            "status": "complete",
            "progress": 100,
            "translated_file": f"translated_{filename}"
        }

    except Exception as e:
        TASKS[task_id] = {"status": "failed", "error": str(e), "progress": TASKS[task_id].get("progress", 0)}

    finally:
        if input_path.exists():
            input_path.unlink()
        if output_path.exists():
            output_path.unlink()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/languages", methods=["GET"])
def get_languages():
    """Returns a dictionary of supported languages from deep_translator."""
    try:
        langs = GoogleTranslator().get_supported_languages(as_dict=True)
        return jsonify(langs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/translate", methods=["POST"])
def translate():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Only .txt files are supported"}), 400

    # Read selected language codes from user submission
    source_lang = request.form.get("source_lang", "auto")
    target_lang = request.form.get("target_lang", "lg")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Prefixing filename with a timestamp to prevent multi-user overwrites
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}_{secure_filename(file.filename)}"
    
    input_path = UPLOAD_DIR / filename
    file.save(input_path)

    upload_r2_key = get_r2_upload_key(filename)
    save_to_r2(input_path, upload_r2_key)

    output_filename = f"translated_{filename}"
    output_path = OUTPUT_DIR / output_filename
    output_r2_key = get_r2_output_key(output_filename)

    if not output_path.exists():
        download_from_r2(output_path, output_r2_key)

    task_id = str(uuid.uuid4())
    TASKS[task_id] = {
        "status": "processing",
        "progress": 0,
        "message": "Initializing multilingual pipeline...",
        "filename": file.filename  # Keep clean name for UI presentation
    }

    thread = threading.Thread(
        target=async_translation_worker,
        args=(task_id, filename, input_path, output_path, output_r2_key, source_lang, target_lang)
    )
    thread.start()

    return jsonify({
        "message": "Translation started in the background.",
        "task_id": task_id
    }), 202


@app.route("/status/<task_id>", methods=["GET"])
def get_status(task_id):
    task = TASKS.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)


@app.route("/download/<path:filename>")
def download(filename):
    filename = secure_filename(filename)
    path = OUTPUT_DIR / filename
    output_r2_key = get_r2_output_key(filename)

    if not path.exists():
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        success = download_from_r2(path, output_r2_key)
        if not success:
            return jsonify({"error": "File not found inside R2 storage"}), 404
            
    return send_file(path, as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
