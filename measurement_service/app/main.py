from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import boto3
from botocore.client import Config
import os
from io import BytesIO
from datetime import datetime
from app.measure import perform_measurement

app = FastAPI(title="Measurement Service", version="1.0.0")

# S3/MinIO configuration
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_BUCKET = os.getenv("S3_BUCKET", "measurements")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

s3_client = boto3.client(
    's3',
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=S3_ACCESS_KEY,
    aws_secret_access_key=S3_SECRET_KEY,
    region_name=S3_REGION,
    config=Config(signature_version='s3v4')
)

class MeasureRequest(BaseModel):
    file_key: str

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

@app.post("/api/measure")
async def measure_from_key(request: MeasureRequest):
    """
    Accept S3 file key, download image, perform measurement, upload result to S3, and return result.
    """
    try:
        # Download file from S3
        response = s3_client.get_object(Bucket=S3_BUCKET, Key=request.file_key)
        image_bytes = response['Body'].read()
        
        # Perform measurement
        measurement_result = perform_measurement(image_bytes)
        
        # Generate result key for S3
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        result_key = f"results/{timestamp}_result.jpg"
        
        # Upload original image to S3 (as result/mask placeholder)
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=result_key,
            Body=image_bytes,
            ContentType='image/jpeg'
        )
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': result_key},
            ExpiresIn=3600
        )
        
        return JSONResponse(content={
            "measurement": measurement_result,
            "result_key": result_key,
            "presigned_url": presigned_url
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Measurement failed: {str(e)}")

@app.post("/api/measure/upload")
async def measure_from_upload(file: UploadFile = File(...)):
    """
    Accept image file upload, perform measurement, upload result to S3, and return result.
    This endpoint is kept for direct file uploads without S3.
    """
    try:
        # Read file content
        image_bytes = await file.read()
        
        # Perform measurement
        measurement_result = perform_measurement(image_bytes)
        
        # Generate result key for S3
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        result_key = f"results/{timestamp}_{file.filename}"
        
        # Upload original image to S3 (as result/mask placeholder)
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=result_key,
            Body=image_bytes,
            ContentType=file.content_type or 'image/jpeg'
        )
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': result_key},
            ExpiresIn=3600
        )
        
        return JSONResponse(content={
            "measurement": measurement_result,
            "result_key": result_key,
            "presigned_url": presigned_url
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Measurement failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
