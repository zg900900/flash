import cv2
import numpy as np
from PIL import Image
import io
import uuid


def perform_measurement(image_bytes: bytes) -> dict:
    """
    Perform measurement on image using CPU-friendly OpenCV operations
    This is a stub that returns demo data. Replace with actual Detectron2 model for production.
    """
    
    # Convert bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Failed to decode image")
    
    height, width = img.shape[:2]
    
    # Simple edge detection for demo purposes
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    
    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Get bounding box of largest contour
    bounds = []
    if contours:
        largest_contour = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest_contour)
        bounds = [
            {"x": int(x), "y": int(y)},
            {"x": int(x + w), "y": int(y)},
            {"x": int(x + w), "y": int(y + h)},
            {"x": int(x), "y": int(y + h)}
        ]
    else:
        # Default bounds (entire image)
        bounds = [
            {"x": 0, "y": 0},
            {"x": width, "y": 0},
            {"x": width, "y": height},
            {"x": 0, "y": height}
        ]
    
    # Create a simple mask (binary threshold)
    _, mask = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
    
    # Convert mask to PNG bytes
    mask_pil = Image.fromarray(mask)
    mask_buffer = io.BytesIO()
    mask_pil.save(mask_buffer, format='PNG')
    mask_bytes = mask_buffer.getvalue()
    
    # Generate unique key for mask
    mask_key = f"mask_{uuid.uuid4()}.png"
    
    return {
        "bounds": bounds,
        "mask_key": mask_key,
        "mask_data": mask_bytes,  # Will be uploaded to S3
        "confidence": 0.85,  # Stub confidence score
        "dimensions": {
            "width": width,
            "height": height
        },
        "status": "success",
        "message": "Measurement completed (CPU stub - replace with Detectron2 for production)"
    }
