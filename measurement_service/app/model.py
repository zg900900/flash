import os
import io
import base64
import numpy as np
import cv2
from PIL import Image

# Try to import Detectron2; if not available, we'll fallback
try:
    from detectron2.engine import DefaultPredictor
    from detectron2.config import get_cfg
    from detectron2 import model_zoo
    DETECTRON2_AVAILABLE = True
except Exception:
    DETECTRON2_AVAILABLE = False

predictor = None

def init_detectron2(model_name="COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"):
    global predictor
    if not DETECTRON2_AVAILABLE:
        return False
    cfg = get_cfg()
    cfg.merge_from_file(model_zoo.get_config_file(model_name))
    cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = 0.5
    cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url(model_name)
    # cpu mode if CUDA not available may be slow; user can configure env for GPU
    predictor = DefaultPredictor(cfg)
    return True

def image_bytes_to_cv2(data: bytes):
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img

def cv2_to_base64_png(img):
    _, buffer = cv2.imencode('.png', img)
    b64 = base64.b64encode(buffer).decode('ascii')
    return f"data:image/png;base64,{b64}"

def detect_with_detectron2(cv2_img):
    """
    Runs Detectron2 predictor and returns combined mask (binary), list of instance masks and bounding boxes.
    """
    global predictor
    if predictor is None:
        init_detectron2()
        if predictor is None:
            raise RuntimeError("Detectron2 predictor not initialized")

    outputs = predictor(cv2_img)
    instances = outputs["instances"].to("cpu")
    if instances.pred_masks.shape[0] == 0:
        return None, []
    masks = instances.pred_masks.numpy()  # (N,H,W)
    boxes = instances.pred_boxes.tensor.numpy()  # (N,4)
    scores = instances.scores.numpy()
    classes = instances.pred_classes.numpy()
    # Filter classes for 'car' or 'truck' if possible; if using COCO, car class id is 2
    TRY_CLASS_IDS = [2, 7]  # 2=car, 7=truck in COCO (approx)
    selected = []
    for i, cls in enumerate(classes):
        if int(cls) in TRY_CLASS_IDS:
            selected.append(i)
    if not selected:
        # fallback: take all
        selected = list(range(len(masks)))
    combined = np.zeros_like(masks[0], dtype=np.uint8)
    inst_list = []
    for i in selected:
        m = masks[i].astype(np.uint8) * 255
        combined = np.maximum(combined, m)
        inst_list.append({
            "mask": m,
            "box": boxes[i].tolist(),
            "score": float(scores[i]),
            "class": int(classes[i])
        })
    return combined, inst_list

def fallback_segment(cv2_img):
    # Simple segmentation fallback: convert to gray, blur, adaptive threshold, find largest contour
    gray = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (7,7), 0)
    # OTSU threshold
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # invert if background is dark
    if np.mean(th) < 127:
        th = 255 - th
    # morphology to fill
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7,7))
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, []
    # find largest contour by area
    c = max(contours, key=cv2.contourArea)
    mask = np.zeros_like(gray, dtype=np.uint8)
    cv2.drawContours(mask, [c], -1, 255, -1)
    x, y, w, h = cv2.boundingRect(c)
    inst = {"mask": mask, "box": [x, y, x+w, y+h], "score": 0.5, "class": 0}
    return mask, [inst]

def run_inference(image_bytes: bytes):
    img = image_bytes_to_cv2(image_bytes)
    if img is None:
        raise ValueError("invalid image")

    if DETECTRON2_AVAILABLE:
        try:
            combined_mask, instances = detect_with_detectron2(img)
        except Exception as e:
            # fallback
            combined_mask, instances = fallback_segment(img)
    else:
        combined_mask, instances = fallback_segment(img)

    if combined_mask is None:
        # return crop full image
        h, w = img.shape[:2]
        bbox = [0, 0, w, h]
        rect = img
        mask_b64 = cv2_to_base64_png(np.zeros((h,w), dtype=np.uint8))
    else:
        # compute bbox of combined mask
        ys, xs = np.where(combined_mask > 0)
        if len(xs) == 0 or len(ys) == 0:
            # fallback
            h, w = img.shape[:2]
            bbox = [0, 0, w, h]
        else:
            minx, maxx = int(xs.min()), int(xs.max())
            miny, maxy = int(ys.min()), int(ys.max())
            bbox = [minx, miny, maxx, maxy]
        # crop rectified (here just the bounding box)
        rect = img[bbox[1]:bbox[3], bbox[0]:bbox[2]].copy()
        mask_crop = combined_mask[bbox[1]:bbox[3], bbox[0]:bbox[2]].copy()
        mask_b64 = cv2_to_base64_png(mask_crop)

    rect_b64 = cv2_to_base64_png(rect)

    # Build part result summarizing the bbox and rectified base64
    part = {
        "name": "whole_car",
        "polygon": [
            {"x": int(bbox[0]), "y": int(bbox[1])},
            {"x": int(bbox[2]), "y": int(bbox[1])},
            {"x": int(bbox[2]), "y": int(bbox[3])},
            {"x": int(bbox[0]), "y": int(bbox[3])},
        ],
        "rectified_base64": rect_b64,
        "mask_base64": mask_b64,
        "bbox": bbox
    }
    return part, img.shape[1], img.shape[0]