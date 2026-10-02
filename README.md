# Multilingual Batch Translator Service

A production-ready, highly resilient, and fully multilingual asynchronous Python microservice built with Flask, Gunicorn, and `boto3`. This service parses large text files (up to and over 400KB / ~8,000 lines), translates text dynamically between hundreds of language combinations using the Google Translation Engine, and tracks tasks asynchronously to prevent server timeouts. State persistence and continuation logic are handled completely out-of-band via Cloudflare R2 object storage.

## Key Features

* **Fully Multilingual Architecture:** Translates dynamically between any source and target languages supported by Google Translate (e.g., English, Luganda, Spanish, Swahili, French, etc.) via dynamic UI controls.
* **Multi-User Resilient:** Automatically prefixes incoming files with precise UTC timestamps (`YYYYMMDDHHMMSS_filename.txt`). Multiple users across different locations can upload identical or distinct files simultaneously without overwriting data or bleeding task state.
* **Asynchronous Processing:** Long-running translations are offloaded into independent background worker threads, instantly returning HTTP `202 Accepted` to the browser.
* **Zero-Downtime Design:** Web request handlers do not block, avoiding Gunicorn synchronization timeouts (`CRITICAL WORKER TIMEOUT`) and high peak-RAM crashes (`SIGKILL` OOM errors).
* **Cloudflare R2 Synchronization:** Storage operates on an ephemeral runtime pattern. Originals and processed outputs are stored safely in isolated R2 bucket directories (`uploads/` and `outputs/`).
* **Stateful Resumption:** If an interrupted file is uploaded again by a user, the backend automatically scans R2, evaluates how many lines have already been translated, and seamlessly picks up right where it stopped.
* **Persistent Client Recovery:** The front-end user interface utilizes browser `localStorage` queues to automatically bind and recover status polling loops even if a user closes their tab, refreshes, or loses connection.

---

## System Architecture Blueprint


```

```
                  +-----------------------------+
                  |       Client Browser        |
                  +--------------+--------------+
                                 |
1. POST /translate (Form Data)   |      2. GET /status/<task_id> (Polling)
(Source, Target & File Payload)  |      (Returns State & Progress %)
                                 v

```

+------------------------------------+------------------------------------+
|                                Flask Server                             |
|                                                                         |
|  +-------------------------+              +--------------------------+  |
|  |     Request Handler     |              |  Async Thread Worker     |  |
|  +------------+------------+              +------------+-------------+  |
|               |                                        |                |
|               | (Saves & Syncs)                        | (Dynamic Engine)
|               v                                        v                |
|  +------------+------------+              +------------+-------------+  |
|  |  Local Ephemeral Disk   |              |  Google Translation API  |  |
|  +------------+------------+              +--------------------------+  |
|               |                                        |                |
|               | (Uploads/Downloads Chunks)             | (Writes Output)|
|               v                                        v                |
+---------------+----------------------------------------+----------------+
|
v
+--------------+--------------+
|     Cloudflare R2 Bucket    |
|  - uploads/* (Source files) |
|  - outputs/* (Translations) |
+-----------------------------+

```

---

## Environment Variable Configuration

The service relies on the following configurations passed through local scopes, Docker Compose variables, or cloud environment panels:

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `SECRET_KEY` | Cryptographic signature string for secure cookies/sessions. | `your-super-secure-string` |
| `MAX_CONTENT_LENGTH` | Max allowed request payload allocation limit in bytes. | `26214400` (Default: 25MB) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 32-character account string hash. | `abc123xyz78900000000000000000000` |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | S3 API compatible access token credential key string. | `9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d` |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY`| S3 API token signature secret authorization string. | `secret-hash-string-generated-by-r2` |
| `CLOUDFLARE_R2_BUCKET` | The dedicated object storage target storage bucket name. | `multilingual-translator-bucket` |
| `PORT` | Networking binding interface destination listener port. | `10000` (Render Default) or `8080` (Fly) |

---

## API Documentation

### 1. Fetch Supported Languages
* **Route:** `/languages`
* **Method:** `GET`
* **Response:** `200 OK`
```json
{
  "english": "en",
  "luganda": "lg",
  "spanish": "es",
  "swahili": "sw"
}

```

### 2. Initiate Translation

* **Route:** `/translate`
* **Method:** `POST`
* **Payload Type:** `multipart/form-data`
* **Parameters:** * `file`: Binary `.txt` asset
* `source_lang`: String language code (e.g., `auto` or `en`)
* `target_lang`: String language code (e.g., `lg`)


* **Response:** `202 Accepted`

```json
{
  "message": "Translation started in the background.",
  "task_id": "8ca192e9-d890-4e31-8653-ec4532cf2b71"
}

```

### 3. Poll Task Progress Status

* **Route:** `/status/<task_id>`
* **Method:** `GET`
* **Responses:**
* **Processing:**
```json
{
  "filename": "source_data.txt",
  "message": "Translated 3210/8000 lines.",
  "progress": 40,
  "status": "processing"
}

```


* **Complete:**
```json
{
  "progress": 100,
  "status": "complete",
  "translated_file": "translated_20260603173000_source_data.txt"
}

```





### 4. Fetch Output File

* **Route:** `/download/<path:filename>`
* **Method:** `GET`
* **Response:** Binary attachment stream download of the tab-delimited processed file.

---

## Deployment Strategy 1: Render

Render runs apps inside isolated virtual environments. Because memory threads execute within a shared workspace, we must explicitly limit Gunicorn concurrency to **exactly one master worker process** to guarantee that memory state alignments stay synchronized across separate requests.

### Setup Steps:

1. Log in to your **Render Dashboard** and click **New +** -> **Web Service**.
2. Connect your Git Repository.
3. Configure the underlying metadata properties precisely as follows:
* **Runtime:** `Python`
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `gunicorn app:app --workers 1 --threads 4 --timeout 60`


4. Expand **Advanced**, click **Add Environment Variable**, and populate all keys listed in the [Environment Configuration table](#environment-variable-configuration).
5. Deploy.

---

## Deployment Strategy 2: Fly.io

Fly.io utilizes native microVM architecture running edge configurations. An explicit `fly.toml` matches our non-blocking threading requirements.

### 1. File Configuration (`fly.toml`)

Ensure this file exists at your repository root directory:

```toml
app = "your-translator-app-name"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  MAX_CONTENT_LENGTH = "26214400"

[[services]]
  http_service = true
  internal_port = 8080
  processes = ["app"]

  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[processes]
  app = "gunicorn app:app --bind 0.0.0.0:8080 --workers 1 --threads 4 --timeout 60"

```

### 2. Execution Setup:

```bash
# Authenticate and link workspace slot
fly auth login
fly launch --no-deploy

# Encrypt and secure Cloudflare R2 values directly inside Fly's Vault
fly secrets set \
  SECRET_KEY="your-secure-secret-key-override" \
  CLOUDFLARE_ACCOUNT_ID="your_account_id" \
  CLOUDFLARE_R2_ACCESS_KEY_ID="your_access_key" \
  CLOUDFLARE_R2_SECRET_ACCESS_KEY="your_secret_key" \
  CLOUDFLARE_R2_BUCKET="your_bucket_name"

# Ship cluster to production
fly deploy

```

---

## Deployment Strategy 3: Docker (Self-Hosted Linux / VPS)

### 1. `Dockerfile`

```dockerfile
FROM python:3.14-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
ENV PYTHONUNBUFFERED=1

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "60"]

```

### 2. `docker-compose.yml`

```yaml
version: '3.8'

services:
  translator:
    build: .
    container_name: multilingual_translator_app
    ports:
      - "5000:5000"
    environment:
      - SECRET_KEY=change-this-production-key
      - MAX_CONTENT_LENGTH=26214400
      - CLOUDFLARE_ACCOUNT_ID=your_id_here
      - CLOUDFLARE_R2_ACCESS_KEY_ID=your_key_here
      - CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_here
      - CLOUDFLARE_R2_BUCKET=your_bucket_name_here
    restart: unless-stopped

```

### 3. Build & Run

```bash
docker-compose up --build -d
docker logs -f multilingual_translator_app

```

---

## Troubleshooting Guide

### 1. Task Disappeared / 404 Status Mismatches

* **Cause:** The server container was restarted or redeployed midway through a job, erasing the ephemeral global memory space dict mappings (`TASKS`).
* **Resolution:** Simply drop the original source file back into the dropzone. Because the file name uses predictable timestamps and hashes, the system will instantly query R2, realize progress already exists up to a specific batch, and seamlessly resume execution without double-billing or losing your spot.

### 2. Handshake Interruption Errors

* **Cause:** Pacing problems with Google translation wrappers if `RATE_LIMIT` boundaries break down.
* **Resolution:** Ensure the internal `RATE_LIMIT` constant stays set to a minimum of `1` second or greater whenever executing dense batch chunks containing over `30` blocks.

---

## Contributing

Contributions are welcome and appreciated. You can help by contributing code, documentation improvements, tests, bug reports, feature ideas, and financial support through GitHub.

If you want to contribute, please start by reviewing open issues, proposing changes, and opening a pull request with clear context for your update. Thoughtful feedback and collaborative review are always welcome.

## Credits

* **Project Author and Maintainer:** Elijah Newton
* **Inspiration:** Mike Aheebwa — https://github.com/AheebwaMike

## License

This project is source-available under the custom license in the root `LICENSE` file. The license allows viewing, personal use, modification, and non-commercial redistribution under its stated terms, while reserving commercial rights and derivative licensing authority to the copyright holder unless separately authorized in writing.

Because those restrictions reserve exclusive control over commercial use and derivatives/relicensing, this is **not** an OSI-approved open-source license.
