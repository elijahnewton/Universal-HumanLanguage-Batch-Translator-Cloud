I converted the desktop Tkinter app into a Flask web app and kept the translation flow batch-based and resumable. The new stack is in app.py, with the web UI in index.html, deployment config in render.yaml, and Python dependencies in requirements.txt.

The translated output is now written locally during processing and then synced to Cloudflare R2 through boto3 using `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, and `CLOUDFLARE_R2_BUCKET`. I also validated the backend with `python -m py_compile app.py`, which passed.

One practical note: this is still a synchronous HTTP translate request, so if your text files are large, Render request timeouts may become the next bottleneck. If you want, I can take the next step and move translation into a background job flow with status polling while keeping the same logic.

Made changes.