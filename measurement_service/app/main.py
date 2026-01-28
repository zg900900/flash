from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import boto3
from botocore.client import Config
import os
import io
from typing import Optional
from .measure import perform_measurement

app = FastAPI(title="Measurement Service", version="1.0.0")

# S3/MinIO configuration
s3_client = boto3.client(
    's3',
    endpoint_url=os.getenv('S3_ENDPOINT', 'http://minio:9000'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID', 'minioadmin'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY', 'minioadmin'),
    config=Config(signature_version='s3v4'),
    region_name='us-east-1'
)

BUCKET_NAME = os.getenv('S3_BUCKET', 'pod-designer')


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "measurement-service"}


@app.post("/infer")
async def infer_measurement(
    image: Optional[UploadFile] = File(None),
    image_key: Optional[str] = None,
    bucket: Optional[str] = None
):
    """
    Accept image upload or S3 key and return measurement results
    """
    try:
        image_data = None
        
        # Get image from upload or S3
        if image:
            image_data = await image.read()
        elif image_key and bucket:
            # Download from S3
            response = s3_client.get_object(Bucket=bucket, Key=image_key)
            image_data = response['Body'].read()
        else:
            raise HTTPException(status_code=400, detail="Either image file or image_key must be provided")
        
        # Perform measurement (stub)
        result = perform_measurement(image_data)
        
        # Upload mask to S3 if generated
        if result.get('mask_data'):
            mask_key = f"masks/{result['mask_key']}"
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=mask_key,
                Body=result['mask_data'],
                ContentType='image/png'
            )
            
            # Generate presigned URL
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': BUCKET_NAME, 'Key': mask_key},
                ExpiresIn=3600
            )
            
            result['mask_url'] = presigned_url
            result['mask_s3_key'] = f"s3://{BUCKET_NAME}/{mask_key}"
            del result['mask_data']  # Remove binary data from response
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Measurement failed: {str(e)}")


@app.post("/measure")
async def measure_endpoint(
    image: Optional[UploadFile] = File(None),
    image_key: Optional[str] = None,
    bucket: Optional[str] = None
):
    """
    Alias for /infer endpoint
    """
    return await infer_measurement(image, image_key, bucket)
