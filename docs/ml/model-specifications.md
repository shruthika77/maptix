# ML Model Specifications

## Model Inventory

This document details every ML model used in the SpatialForge pipeline, including architecture, training strategy, performance targets, and deployment configuration.

---

## 1. Input Classifier

**Purpose:** Determine what type of input image was uploaded (floor plan scan, room photo, hand sketch, etc.)

| Property | Value |
|----------|-------|
| Architecture | EfficientNet-B2 |
| Input | 224×224 RGB image |
| Output | 5 classes (softmax) |
| Classes | `floor_plan_scan`, `room_photo`, `hand_sketch`, `3d_render`, `other` |
| Training Data | ~10K images (2K per class), augmented to ~50K |
| Training Strategy | Transfer learning from ImageNet, fine-tune all layers |
| Expected Accuracy | >95% top-1 |
| Inference Time | <50ms (CPU), <10ms (GPU) |
| Framework | PyTorch → ONNX |
| Size | ~30MB (ONNX) |

**Data Sources:**
- Floor plan scans: CubiCasa5K + Google Images scraping + manual collection
- Room photos: SUN RGB-D + OpenImages indoor categories
- Hand sketches: Generated from floor plans (style transfer) + manual collection
- 3D renders: Structured3D dataset renders

**Augmentation:** Random rotation (±15°), scaling (0.8-1.2), brightness/contrast jitter, Gaussian noise, JPEG compression artifacts

---

## 2. Floor Plan Segmentation Model

**Purpose:** Pixel-level segmentation of floor plan elements (walls, doors, windows, rooms, text)

| Property | Value |
|----------|-------|
| Architecture | SegFormer-B3 (MIT-B3 backbone) |
| Alternative | U-Net with EfficientNet-B4 encoder |
| Input | 512×512 RGB image (resized with padding) |
| Output | 512×512 × 8 classes (per-pixel) |
| Classes | `background`, `wall`, `door`, `window`, `room_interior`, `dimension_line`, `text`, `furniture` |
| Training Data | CubiCasa5K (primary) + custom annotations |
| Training Strategy | Transfer from ADE20K pretrained → fine-tune on floor plans |
| Expected mIoU | >0.72 (target: 0.78 with custom data) |
| Expected Wall IoU | >0.85 |
| Inference Time | <200ms (GPU), <2s (CPU with ONNX) |
| Framework | PyTorch → ONNX Runtime |
| Size | ~190MB (ONNX) |

**Training Configuration:**
```yaml
optimizer: AdamW
learning_rate: 0.00006
weight_decay: 0.01
scheduler: polynomial_decay (power=1.0)
batch_size: 8 (GPU) / 2 (CPU fine-tune)
epochs: 100
early_stopping_patience: 15
loss: CrossEntropyLoss + DiceLoss (0.5 + 0.5)
augmentation:
  - RandomHorizontalFlip(p=0.5)
  - RandomVerticalFlip(p=0.5)
  - RandomRotation(degrees=[-10, 10])
  - ColorJitter(brightness=0.2, contrast=0.2)
  - RandomResizedCrop(scale=[0.8, 1.2])
  - GaussianNoise(sigma=0.01)
```

**Post-Processing Pipeline:**
1. Argmax → class map
2. CRF refinement (pydensecrf) — optional, improves boundaries
3. Morphological closing on wall class (fill small gaps)
4. Connected component analysis per class
5. Filter small components (noise)
6. Vectorize: contours → simplified polygons

---

## 3. Object Detection Model (Indoor Elements)

**Purpose:** Detect and locate doors, windows, and other structural elements in room photos

| Property | Value |
|----------|-------|
| Architecture | YOLOv8m (medium) |
| Input | 640×640 RGB image |
| Output | Bounding boxes + class + confidence |
| Classes | `door`, `window`, `wall_outlet`, `light_switch`, `radiator`, `column`, `beam`, `staircase`, `elevator_door` |
| Training Data | OpenImages V7 (indoor subset) + COCO (door/window) + custom |
| Training Strategy | Fine-tune from COCO pretrained |
| Expected mAP@50 | >0.78 |
| Expected mAP@50-95 | >0.55 |
| Inference Time | <30ms (GPU), <200ms (CPU) |
| Framework | Ultralytics → ONNX/TensorRT |
| Size | ~100MB (ONNX) |

**Training Configuration:**
```yaml
model: yolov8m.pt  # pretrained
epochs: 150
patience: 30
batch_size: 16
imgsz: 640
optimizer: SGD
lr0: 0.01
lrf: 0.01
momentum: 0.937
weight_decay: 0.0005
augmentation:
  hsv_h: 0.015
  hsv_s: 0.7
  hsv_v: 0.4
  degrees: 5.0
  translate: 0.1
  scale: 0.5
  fliplr: 0.5
  mosaic: 1.0
  mixup: 0.15
```

---

## 4. Depth Estimation Model

**Purpose:** Estimate dense depth map from a single room photo (for 3D reconstruction from photos)

| Property | Value |
|----------|-------|
| Architecture | ZoeDepth (BEiT-L backbone) |
| Alternative | MiDaS v3.1 (DPT-Hybrid) for faster inference |
| Input | Variable resolution (resized internally) |
| Output | Dense depth map (metric depth in meters) |
| Metric Range | 0.1m - 20m (indoor) |
| Expected AbsRel | <0.08 (NYU Depth V2) |
| Inference Time | <300ms (GPU), <3s (CPU) |
| Framework | PyTorch → ONNX |
| Size | ~1.4GB (ZoeDepth), ~470MB (MiDaS) |

**Usage Notes:**
- ZoeDepth provides metric (absolute) depth — needed for real-world scale
- MiDaS provides relative depth only — use when scale is known from other sources
- For MVP: Use MiDaS (lighter, faster) + user-provided scale
- For Advanced: Use ZoeDepth for automatic scale estimation

---

## 5. Room Layout Estimation Model

**Purpose:** Estimate 3D room layout (walls, floor, ceiling) from a single panoramic or perspective image

| Property | Value |
|----------|-------|
| Architecture | HorizonNet |
| Alternative | LED² (Layout Estimation via Diffusion) |
| Input | 512×1024 equirectangular OR 256×512 perspective |
| Output | Room corner positions (3D), wall-floor/wall-ceiling boundaries |
| Training Data | Structured3D + PanoContext + custom |
| Expected 3D IoU | >0.80 (cuboid rooms), >0.65 (general rooms) |
| Inference Time | <150ms (GPU) |
| Framework | PyTorch → ONNX |
| Size | ~120MB |

**Usage Notes:**
- Works best with 360° panoramic images
- For standard perspective images: use with LayoutNetV2
- Output: polyline boundaries → can convert to 3D room box
- Combine with depth estimation for better accuracy

---

## 6. OCR Model (Text & Dimension Extraction)

**Purpose:** Extract text from floor plans — room labels, dimensions, annotations

| Property | Value |
|----------|-------|
| System | PaddleOCR v2 |
| Components | Text Detection (DB) + Text Recognition (CRNN) + Angle Classifier |
| Languages | English, numbers, common architectural abbreviations |
| Input | Any resolution image (pre-cropped regions preferred) |
| Output | Bounding boxes + recognized text + confidence |
| Expected Accuracy | >90% character accuracy on clean plans, >75% on noisy scans |
| Inference Time | <500ms per image (GPU) |
| Framework | PaddlePaddle → ONNX |
| Size | ~15MB (detection) + ~10MB (recognition) |

**Post-Processing for Dimensions:**
```python
dimension_patterns = [
    r"(\d+\.?\d*)\s*(m|cm|mm|ft|'|\")",     # "3.5m", "12ft", "6'"
    r"(\d+)\s*['-]\s*(\d+)\s*(\")?",          # "12'-6", "12-6""
    r"(\d+)\s*x\s*(\d+)\s*(m|cm|mm|ft)?",    # "4x3m", "12x10"
    r"(\d+\.?\d*)\s*[×]\s*(\d+\.?\d*)",       # "4.5×3.2"
]
# Parse matched text → convert to meters → associate with nearest wall/room
```

---

## 7. Floor Plan Symbol Detector

**Purpose:** Detect architectural symbols in floor plans (bathroom fixtures, kitchen appliances, electrical symbols)

| Property | Value |
|----------|-------|
| Architecture | YOLOv8s (small — symbols are simpler) |
| Input | 640×640 floor plan crop |
| Output | Bounding boxes + symbol class |
| Classes | `toilet`, `sink`, `bathtub`, `shower`, `stove`, `refrigerator`, `washing_machine`, `door_swing_arc`, `window_symbol`, `stair_arrow`, `electrical_outlet`, `light_fixture` |
| Training Data | Custom annotated (500-1000 per class) + synthetic generation |
| Expected mAP@50 | >0.70 |
| Inference Time | <15ms (GPU) |
| Framework | Ultralytics → ONNX |
| Size | ~45MB |

**Synthetic Data Generation Strategy:**
1. Collect symbol templates from architectural standards (ISO, ANSI, JIS)
2. Place symbols randomly on blank backgrounds and on real floor plans
3. Apply augmentations: rotation, scaling, noise, line thickness variation
4. Generate 5000-10000 synthetic training images
5. Supplement with 500-1000 manually annotated real floor plans

---

## 8. Room Type Classifier (Zero-Shot)

**Purpose:** Classify room type from visual content or textual clues

| Property | Value |
|----------|-------|
| Architecture | CLIP (ViT-B/32) |
| Approach | Zero-shot classification with text prompts |
| Input | Room photo OR cropped floor plan region |
| Output | Room type with confidence score |
| Prompt Template | "a photo of a {room_type}" or "a floor plan of a {room_type}" |

**Room Type Prompts:**
```python
room_prompts = {
    "living_room": ["a living room", "a lounge", "a sitting room"],
    "bedroom": ["a bedroom", "a master bedroom", "a sleeping room"],
    "kitchen": ["a kitchen", "a cooking area", "a kitchenette"],
    "bathroom": ["a bathroom", "a washroom", "a toilet room"],
    "office": ["an office", "a study room", "a workspace"],
    "dining_room": ["a dining room", "a dining area"],
    "hallway": ["a hallway", "a corridor", "an entrance hall"],
    "closet": ["a closet", "a storage room", "a wardrobe"],
    "laundry": ["a laundry room", "a utility room"],
    "garage": ["a garage", "a parking space"],
    "balcony": ["a balcony", "a terrace", "a patio"],
}
```

**Usage Notes:**
- No training needed — use pretrained CLIP directly
- Supplement with rule-based classification (fixture detection results)
- Final classification = weighted combination of CLIP + fixture-based + OCR-label

---

## Model Deployment Strategy

### Development
- All models run locally via PyTorch
- GPU: NVIDIA RTX 4090 or equivalent

### Staging/Production (MVP)
- Convert all models to ONNX format
- Run with ONNX Runtime (CPU for light models, GPU for heavy ones)
- Single GPU server with model loading/unloading

### Production (Scale)
- NVIDIA Triton Inference Server
- Model ensemble pipeline (Triton handles chaining)
- Dynamic batching for throughput
- Multi-GPU with model-level parallelism
- Auto-scaling based on queue depth

### Model Versioning
- MLflow for experiment tracking and model registry
- DVC for dataset versioning
- Semantic versioning for deployed models
- A/B testing infrastructure for model upgrades

```
MODEL DEPLOYMENT ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌───────────────┐    ┌─────────────────────────────────────────┐
│ Processing    │    │  NVIDIA Triton Inference Server          │
│ Service       │───▶│                                          │
│               │    │  ┌─────────────┐  ┌─────────────┐      │
│ gRPC/HTTP     │    │  │ Model A     │  │ Model B     │      │
│               │    │  │ (SegFormer) │  │ (YOLOv8)    │      │
│               │    │  │ GPU 0       │  │ GPU 0       │      │
│               │    │  └─────────────┘  └─────────────┘      │
│               │    │  ┌─────────────┐  ┌─────────────┐      │
│               │    │  │ Model C     │  │ Model D     │      │
│               │    │  │ (ZoeDepth)  │  │ (PaddleOCR) │      │
│               │    │  │ GPU 1       │  │ CPU         │      │
│               │    │  └─────────────┘  └─────────────┘      │
│               │◀───│                                          │
│               │    │  Dynamic Batching | Model Warm-up |     │
└───────────────┘    │  Health Checks   | Metrics        |     │
                     └─────────────────────────────────────────┘
```

---

## Training Infrastructure

### Hardware Requirements
| Task | Minimum | Recommended |
|------|---------|-------------|
| SegFormer Training | 1× RTX 3090 (24GB) | 2× A100 (40GB) |
| YOLOv8 Training | 1× RTX 3080 (10GB) | 1× A100 (40GB) |
| ZoeDepth Fine-tune | 1× A100 (40GB) | 2× A100 (80GB) |
| Inference (all models) | 1× RTX 3060 (12GB) | 1× A10G (24GB) |
| CPU-only Inference | 8-core + 32GB RAM | 16-core + 64GB RAM |

### Training Timeline
| Model | Dataset Prep | Training | Validation | Total |
|-------|-------------|----------|------------|-------|
| Input Classifier | 1 week | 2 days | 1 day | ~2 weeks |
| SegFormer | 2 weeks | 3-5 days | 2 days | ~3 weeks |
| YOLOv8 Objects | 2 weeks | 2-3 days | 1 day | ~3 weeks |
| Symbol Detector | 3 weeks | 2 days | 1 day | ~4 weeks |
| Fine-tuning cycle | 1 week | 1-2 days | 1 day | ~2 weeks |

### Active Learning Pipeline
```
User corrections → Export → Quality filter → Add to training set
                                                      │
Retrain model (weekly/monthly) ◀──────────────────────┘
                │
Evaluate on held-out test set
                │
If improved → Deploy new version (canary rollout)
If not → Investigate, adjust, retry
```
