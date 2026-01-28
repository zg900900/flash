import numpy as np
import cv2
from PIL import Image
from io import BytesIO
from typing import Dict, Any

def perform_measurement(image_bytes: bytes) -> Dict[str, Any]:
    """
    Perform simple measurement on image using OpenCV/Pillow.
    Returns a stub mask/bbox result.
    """
    try:
        # Load image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        height, width = img.shape[:2]
        
        # Create a simple stub mask (center rectangle)
        center_x, center_y = width // 2, height // 2
        box_width, box_height = width // 4, height // 4
        
        x1 = max(0, center_x - box_width // 2)
        y1 = max(0, center_y - box_height // 2)
        x2 = min(width, center_x + box_width // 2)
        y2 = min(height, center_y + box_height // 2)
        
        # Return measurement result
        return {
            "bounds": [int(x1), int(y1), int(x2), int(y2)],
            "confidence": 0.9,
            "image_size": [width, height]
        }
    except Exception as e:
        raise ValueError(f"Measurement failed: {str(e)}")
