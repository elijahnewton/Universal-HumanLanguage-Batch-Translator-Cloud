import os
import time
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


def r2_object_key(original_name: str) -> str:
    return f"translated/{original_name}"


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


def translate_file(input_path: Path, output_path: Path) -> dict:
    translator = GoogleTranslator(source="auto", target="lg")

    with input_path.open("r", encoding="utf-8") as file:
        all_phrases = [line.strip() for line in file if line.strip()]

    total_phrases = len(all_phrases)
    total_batches = (total_phrases + BATCH_SIZE - 1) // BATCH_SIZE
    lines_already_done = 0

    if output_path.exists():
        with output_path.open("r", encoding="utf-8") as file:
            lines_already_done = sum(1 for _ in file)

    phrases_to_translate = all_phrases[lines_already_done:]
    translated_now = 0
    status_messages = []

    if not phrases_to_translate:
        return {
            "status": "complete",
            "total_lines": total_phrases,
            "translated_lines": total_phrases,
            "total_batches": total_batches,
            "completed_batches": total_batches,
            "messages": ["File already fully translated."],
            "output_path": str(output_path),
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)

    status_messages.append(f"Starting translation from line {lines_already_done + 1}")
    status_messages.append(f"Total lines to translate: {len(phrases_to_translate)}")
    status_messages.append(f"Total batches to process: {(len(phrases_to_translate) + BATCH_SIZE - 1) // BATCH_SIZE}")

    for i in range(0, len(phrases_to_translate), BATCH_SIZE):
        batch = phrases_to_translate[i : i + BATCH_SIZE]
        current_batch_num = (lines_already_done + i + len(batch) + BATCH_SIZE - 1) // BATCH_SIZE
        status_messages.append(f"Translating batch {current_batch_num}/{total_batches} ({len(batch)} lines)...")

        translations = translator.translate_batch(batch)

        with output_path.open("a", encoding="utf-8") as file:
            for original, translated in zip(batch, translations):
                file.write(f"{original}\t{translated}\n")

        translated_now += len(batch)
        time.sleep(RATE_LIMIT)

    translated_lines = lines_already_done + translated_now
    completed_batches = (translated_lines + BATCH_SIZE - 1) // BATCH_SIZE

    return {
        "status": "complete",
        "total_lines": total_phrases,
        "translated_lines": translated_lines,
        "total_batches": total_batches,
        "completed_batches": completed_batches,
        "messages": status_messages,
        "output_path": str(output_path),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat() + "Z"})


@app.route("/translate", methods=["POST"])
def translate():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Only .txt files are supported"}), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    filename = secure_filename(file.filename)
    input_path = UPLOAD_DIR / filename
    file.save(input_path)

    output_filename = f"translated_{filename}"
    output_path = OUTPUT_DIR / output_filename

    r2_key = r2_object_key(output_filename)
    if not output_path.exists():
        download_from_r2(output_path, r2_key)

    result = translate_file(input_path, output_path)
    save_to_r2(output_path, r2_key)

    return jsonify(
        {
            "filename": filename,
            "translated_file": output_filename,
            "result": result,
        }
    )


@app.route("/download/<path:filename>")
def download(filename):
    path = OUTPUT_DIR / secure_filename(filename)
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(path, as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
