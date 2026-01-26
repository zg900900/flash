from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from typing import Optional
import os
import base64
import io
import time
import uuid
import boto3
from botocore.client import Config

from .model import run_inference, DETECTRON2_AVAILABLE, init_detectron2, cv2_to_base64_png

app = FastAPI(title="Measurement Service (Detectron2 PoC)")

# S3/MinIO config from env
S3_ENDPOINT = os.environ.get("S3_ENDPOINT")  # e.g. http://minio:9000
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", os.environ.get("MINIO_ROOT_USER"))
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", os.environ.get("MINIO_ROOT_PASSWORD"))
S3_BUCKET = os.environ.get("S3_BUCKET", "pod")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")

if S3_ENDPOINT:
    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name=S3_REGION
    )
else:
    s3 = boto3.client("s3", region_name=S3_REGION)

def upload_bytes_to_s3(buffer: bytes, key: str, content_type: str = "image/png"):
    # create bucket if not exists (best-effort)
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except Exception:
        try:
            s3.create_bucket(Bucket=S3_BUCKET)
        except Exception:
            pass
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=buffer, ContentType=content_type)
    endpoint = S3_ENDPOINT.rstrip("/") if S3_ENDPOINT else ""
    url = f"{endpoint}/{S3_BUCKET}/{key}" if endpoint else f"{S3_BUCKET}/{key}"
    return key, url

# NOTE: @app.on_event is deprecated in FastAPI 0.109.1+
# For production, consider migrating to lifespan context manager
@app.on_event("startup")
async def startup_event():
    if DETECTRON2_AVAILABLE:
        try:
            init_detectron2()
            print("Detectron2 initialized")
        except Exception as e:
            print("Detectron2 init failed:", e)

@app.post("/infer")
async def infer(file: UploadFile = File(...), W: Optional[float] = Form(None), unit: Optional[str] = Form("mm")):
    """
    Accept uploaded image file (multipart/form-data).
    Optional form fields:
      - W: vehicle width (number)
      - unit: 'mm'|'cm'|'m'
    Returns JSON with part rectified_base64, mask_base64, bbox, and simple physical size estimate if W provided.
    Additionally uploads rectified & mask to S3 and returns keys/URLs.
    """
    data = await file.read()
    try:
        part, img_w, img_h = run_inference(data)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # convert rectified_base64 and mask_base64 to bytes and upload to S3 if present
    rect_key = None
    rect_url = None
    mask_key = None
    mask_url = None

    # rectified_base64 may be 'data:image/png;base64,...'
    rect_b64 = part.get("rectified_base64")
    mask_b64 = part.get("mask_base64")
    ts = int(time.time())
    uid = uuid.uuid4().hex[:8]
    try:
        if rect_b64:
            if rect_b64.startswith("data:"):
                header, b64 = rect_b64.split(",", 1)
                buf = base64.b64decode(b64)
                filename = f"measurements/{ts}-{uid}-rect.png"
                rect_key, rect_url = upload_bytes_to_s3(buf, filename, "image/png")
            else:
                # assume it's raw base64
                buf = base64.b64decode(rect_b64)
                filename = f"measurements/{ts}-{uid}-rect.png"
                rect_key, rect_url = upload_bytes_to_s3(buf, filename, "image/png")
        if mask_b64:
            if mask_b64.startswith("data:"):
                header, b64 = mask_b64.split(",", 1)
                buf = base64.b64decode(b64)
                filename = f"measurements/{ts}-{uid}-mask.png"
                mask_key, mask_url = upload_bytes_to_s3(buf, filename, "image/png")
            else:
                buf = base64.b64decode(mask_b64)
                filename = f"measurements/{ts}-{uid}-mask.png"
                mask_key, mask_url = upload_bytes_to_s3(buf, filename, "image/png")
    except Exception as e:
        # uploading failed but we still return inference result
        print("S3 upload failed:", e)

    # compute simple size estimate if user provided W (vehicle width)
    phys = None
    if W is not None:
        if unit == "mm":
            W_m = W / 1000.0
        elif unit == "cm":
            W_m = W / 100.0
        else:
            W_m = W
        bbox = part.get("bbox")
        if bbox:
            bbox_w_px = bbox[2] - bbox[0]
            meters_per_pixel = W_m / bbox_w_px if bbox_w_px > 0 else None
            phys = {
                "vehicle_W_m": W_m,
                "bbox_w_px": bbox_w_px,
                "meters_per_pixel": meters_per_pixel
            }

    response = {
        "part": {
            "name": part.get("name"),
            "polygon": part.get("polygon"),
            "bbox": part.get("bbox"),
            "rectified_key": rect_key,
            "rectified_url": rect_url,
            "mask_key": mask_key,
            "mask_url": mask_url
        },
        "image_size": {"w": img_w, "h": img_h},
        "detection": {"detectron2": bool(DETECTRON2_AVAILABLE)},
        "physical_estimate": phys
    }
    return response