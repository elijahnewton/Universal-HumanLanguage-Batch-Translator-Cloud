I converted the desktop Tkinter app into a Flask web app and kept the translation flow batch-based and resumable. The new stack is in app.py, with the web UI in index.html, deployment config in render.yaml, and Python dependencies in requirements.txt.

The translated output is now written locally during processing and then synced to Cloudflare R2 through boto3 using `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, and `CLOUDFLARE_R2_BUCKET`. I also validated the backend with `python -m py_compile app.py`, which passed.

One practical note: this is still a synchronous HTTP translate request, so if your text files are large, Render request timeouts may become the next bottleneck. If you want, I can take the next step and move translation into a background job flow with status polling while keeping the same logic.

What Changed?
Separated R2 Folders: Created distinct virtual directory paths for uploads (uploads/filename) and outputs (outputs/translated_filename).

No local persistent storage needed: The incoming file is processed, saved to R2 immediately, and downloaded if a resumption is needed. Temporary local files are safely cleaned up using a finally block to keep your container completely state-free.

Resumption Support from R2: If an input file has already been processed or half-processed before, the app downloads both the original source file and the current translation progress directly from R2 to pick up where it left off.
