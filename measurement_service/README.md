```markdown
# Measurement Service (Detectron2 PoC)

This is a minimal FastAPI measurement/inference service.

New in this version:
- After inference, rectified & mask images are uploaded to S3/MinIO (config via env) and the API returns keys + URLs.
- Use this service as a standalone inference service or let the backend worker call it and write results into jobs table.

Env variables (required):
- S3_ENDPOINT (e.g. http://minio:9000)
- S3_ACCESS_KEY
- S3_SECRET_KEY
- S3_BUCKET (e.g. pod)
- S3_REGION (optional, default us-east-1)

Run quick (CPU fallback segmentation only):
1. Build
   docker build -t measurement-service:local .

2. Run
   docker run --rm -p 8000:8000 \
     -e S3_ENDPOINT=http://minio:9000 \
     -e S3_ACCESS_KEY=minioadmin \
     -e S3_SECRET_KEY=minioadmin \
     -e S3_BUCKET=pod \
     measurement-service:local

3. Example:
   curl -F "file=@./test.jpg" -F "W=1800" -F "unit=mm" http://localhost:8000/infer

Detectron2:
- To enable Detectron2 you must install compatible torch + detectron2 wheel for your CUDA/PyTorch version.
- See Detectron2 install docs: https://detectron2.readthedocs.io/en/latest/tutorials/install.html

Notes:
- Service will upload rectified & mask images to configured S3 and return { rectified_key, rectified_url, mask_key, mask_url }.
- If you want the Python service to directly update backend DB, do that from backend worker instead (preferred).
```