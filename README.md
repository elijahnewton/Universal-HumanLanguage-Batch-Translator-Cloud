
# Luganda Batch Translator Service

A production-ready, highly resilient asynchronous Python microservice built with Flask, Gunicorn, and `boto3`. This service parses large text assets (up to and over 400KB / ~8,000 lines), translates chunks iteratively using the Google Translation Engine into Luganda (`lg`), provides state persistence and continuation logic via Cloudflare R2 object storage, and uses a non-blocking background thread worker layout to prevent server timeouts.

## Key Features

* **Asynchronous Processing:** Long-running translations are offloaded into independent worker threads instantly returning HTTP `202 Accepted`.
* **Zero-Downtime Resilience:** Web request handlers do not block, avoiding Gunicorn synchronization timeouts (`CRITICAL WORKER TIMEOUT`) and high peak-RAM crashes (`SIGKILL` OOM errors).
* **Cloudflare R2 Synchronization:** Files are managed using an ephemeral runtime pattern. Originals and partial metrics are stored safely in R2 buckets across custom folders (`uploads/` and `outputs/`).
* **Stateful Resumption:** If an interrupted file is uploaded again, the backend automatically scans R2, evaluates how many lines have already been written, and continues from the exact stop point.
* **Ephemeral Disk Layout:** The runtime safely isolates file buffers and runs forced structural clean-ups in explicit `finally` scopes to minimize storage leaks.
* **Persistent Client Recovery:** Front-end assets make use of `localStorage` queues to automatically bind and recover status loops even if a user closes, reloads, or switches devices midway.

---

## System Architecture Blueprint


```

```
                  +-----------------------------+
                  |       Client Browser        |
                  +--------------+--------------+
                                 |
         1. POST /translate      |      2. GET /status/<task_id> (Polling)
         (Instant 202 Return)    |      (Returns State & Progress %)
                                 v

```

+------------------------------------+------------------------------------+
|                                Flask Server                             |
|                                                                         |
|  +-------------------------+              +--------------------------+  |
|  |     Request Handler     |              |  Async Thread Worker     |  |
|  +------------+------------+              +------------+-------------+  |
|               |                                        |                |
|               | (Saves & Syncs)                        | (Pulls Engine) |
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

The service relies on the following configurations passed through local scopes, Docker Compose variables, or Render's Environment panel:

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `SECRET_KEY` | Cryptographic signature string for secure cookies/sessions. | `your-super-secure-uuid-or-string` |
| `MAX_CONTENT_LENGTH` | Max allowed request payload allocation limit in bytes. | `26214400` (Default: 25MB) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 32-character account string hash. | `abc123xyz78900000000000000000000` |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | S3 API compatible access token credential key string. | `9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d` |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY`| S3 API token signature secret authorization string. | `secret-hash-string-generated-by-r2` |
| `CLOUDFLARE_R2_BUCKET` | The dedicated object storage target storage bucket name. | `luganda-translator-bucket` |
| `PORT` | Networking binding interface destination listener port. | `10000` (Render Default) |

---

## API Documentation

### 1. Initiate Translation
* **Route:** `/translate`
* **Method:** `POST`
* **Payload Type:** `multipart/form-data`
* **Parameters:** `file` (Binary `.txt` asset)
* **Response:** `202 Accepted`
```json
{
  "message": "Translation started in the background.",
  "task_id": "4fa815e9-d890-4e31-8653-ec4532cf2b52"
}

```

### 2. Poll Task Progress Status

* **Route:** `/status/<task_id>`
* **Method:** `GET`
* **Responses:**
* **Processing:**
```json
{
  "filename": "source_data.txt",
  "message": "Translated 2430/6000 lines.",
  "progress": 40,
  "status": "processing"
}

```


* **Complete:**
```json
{
  "progress": 100,
  "status": "complete",
  "translated_file": "translated_source_data.txt"
}

```





### 3. Fetch Output File

* **Route:** `/download/<path:filename>`
* **Method:** `GET`
* **Response:** Binary attachment response stream download of parsed text file.

---

## Deployment Strategy 1: Render (Cloud PaaS)

Render runs container apps inside isolated sandboxes. Because threads execute within a shared workspace, we must configure Gunicorn to limit its target concurrency states to exactly one master worker process to guarantee memory structures align safely across status calls.

### Configuration via Render Web Console

1. Log in to your **Render Dashboard** and select **New +** -> **Web Service**.
2. Connect your Git Repository containing this project setup.
3. Configure the underlying deployment metadata properties as follows:
* **Runtime:** `Python 3.14` (or target framework image)
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `gunicorn app:app --workers 1 --threads 4 --timeout 60`


4. Expand the **Advanced** section, click **Add Environment Variable**, and populate all keys specified under the [Environment Variable Configuration](https://www.google.com/search?q=%23environment-variable-configuration) section.
5. Hit **Deploy Web Service**.

> **CRITICAL CONFIGURATION NOTICE:** Setting `--workers 1` guarantees that state records stored inside the application thread runtime (`TASKS` dict mapping arrays) remain synchronized on Render's internal reverse routing proxy. Spawning additional workers will result in tracking faults (`404 Task Not Found`).

---

## Deployment Strategy 2: Docker Setup (Self-Hosted)

For infrastructure management via Docker, use the following production configurations.

### 1. Create a `Dockerfile`

Save this file alongside your repository root directory structure:

```dockerfile
FROM python:3.14-slim

WORKDIR /app

# System dependencies layer initialization
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

### 2. Create a `docker-compose.yml` Structure

Use a compose structure to set up variables cleanly:

```yaml
version: '3.8'

services:
  translator-service:
    build: .
    container_name: luganda_translator_app
    ports:
      - "5000:5000"
    environment:
      - SECRET_KEY=your-production-secret-override-key
      - MAX_CONTENT_LENGTH=26214400
      - CLOUDFLARE_ACCOUNT_ID=your_id_here
      - CLOUDFLARE_R2_ACCESS_KEY_ID=your_key_here
      - CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_here
      - CLOUDFLARE_R2_BUCKET=your_bucket_name_here
    restart: unless-stopped

```

### 3. Execution Commands

To build and launch the application infrastructure locally or on a VPS instance, run:

```bash
# Build and stand up the operational container stack in background detached state
docker-compose up --build -d

# Inspect live application performance metrics logs
docker logs -f luganda_translator_app

```

The system will initialize and start listening for uploads directly at `http://localhost:5000`.

---

## Local Development Lifecycle Guide

To test code enhancements locally without containers:

```bash
# 1. Initialize virtual isolated execution dependencies workspace environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Add application packages
pip install -r requirements.txt

# 3. Export credential configurations safely to your terminal context
export CLOUDFLARE_ACCOUNT_ID="your_id"
export CLOUDFLARE_R2_ACCESS_KEY_ID="your_access_key"
export CLOUDFLARE_R2_SECRET_ACCESS_KEY="your_secret_key"
export CLOUDFLARE_R2_BUCKET="your_bucket_name"

# 4. Initiate local development mode engine setup
python app.py

```

---

## Troubleshooting Lifecycle Scenarios

### Task Disappeared / 404 Status Mismatches

* **Cause:** The app was deployed with multiple Gunicorn workers (`--workers > 1`), or the Render instance performed its automated daily cycle reset.
* **Resolution:** Re-uploading the file triggers an instant resume. The engine scans Cloudflare R2, detects how many lines were already written to `outputs/translated_...`, skips them, and continues translating without loss of progress or duplicate api calls.

### API Connection Drop / Handshake Interrupted

* **Cause:** Frequent queries hitting translation structures without pacing blocks.
* **Resolution:** Ensure `RATE_LIMIT` matches standard pacing delays (`1` second intervals minimum per batch processing loops) to secure clean, long-lasting request handling loops.
