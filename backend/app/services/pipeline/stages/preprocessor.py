"""
Stage 1: Input Preprocessing

Handles all input types and normalizes them into a common intermediate format
that downstream stages can work with.
"""

import io
import numpy as np
import cv2
from typing import Dict, List, Any
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


@dataclass
class PreprocessedData:
    """Common intermediate format for all input types."""
    
    # Source info
    project_id: str = ""
    source_files: List[dict] = field(default_factory=list)
    
    # Processed images (ready for detection)
    floor_plan_images: List[dict] = field(default_factory=list)
    # Each: {"image": np.ndarray, "binary": np.ndarray, "scale": float, "source_id": str}
    
    room_photos: List[dict] = field(default_factory=list)
    # Each: {"image": np.ndarray, "source_id": str}
    
    # Vector data (from PDFs, CAD)
    vector_geometries: List[dict] = field(default_factory=list)
    # Each: {"lines": [...], "texts": [...], "source_id": str}
    
    # Point cloud data (from LiDAR, AR)
    point_clouds: List[dict] = field(default_factory=list)
    
    # Detected scale (meters per pixel for raster, absolute for vector)
    detected_scale: float = None
    scale_confidence: float = 0.0
    scale_source: str = "unknown"


class Preprocessor:
    """
    Multi-format input preprocessor.
    
    Responsibilities:
    - Download files from object storage
    - Classify input type
    - Apply appropriate preprocessing
    - Extract raw features
    - Detect scale
    """
    
    def process(self, project_id: str) -> PreprocessedData:
        """Process all files in a project."""
        result = PreprocessedData(project_id=project_id)
        
        # Load project files from database
        files = self._load_project_files(project_id)
        
        for file_info in files:
            file_type = file_info.get("detected_type") or file_info.get("file_type")
            
            if file_type in ("floor_plan_image", "hand_sketch"):
                self._process_floor_plan_image(file_info, result)
            elif file_type == "room_photo":
                self._process_room_photo(file_info, result)
            elif file_type == "pdf_blueprint":
                self._process_pdf(file_info, result)
            elif file_type == "cad_file":
                self._process_cad(file_info, result)
            elif file_type == "lidar_scan":
                self._process_lidar(file_info, result)
            else:
                # Auto-classify and process
                self._auto_classify_and_process(file_info, result)
        
        return result
    
    def _process_floor_plan_image(self, file_info: dict, result: PreprocessedData):
        """
        Floor plan image preprocessing pipeline:
        1. Load image
        2. Deskew (straighten rotated scans)
        3. Denoise
        4. Binarize (adaptive thresholding)
        5. Clean (morphological operations)
        6. Detect scale
        """
        logger.info("Processing floor plan image", file=file_info.get("filename"))
        
        # Load image from storage
        image_bytes = self._download_file(file_info["storage_path"])
        image = cv2.imdecode(
            np.frombuffer(image_bytes, np.uint8),
            cv2.IMREAD_COLOR
        )
        
        if image is None:
            logger.error("Failed to decode image", file=file_info.get("filename"))
            return
        
        # Step 1: Resize if too large (max 4000px on longest side)
        h, w = image.shape[:2]
        max_dim = 4000
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        
        # Step 2: Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Step 3: Deskew
        gray = self._deskew(gray)
        
        # Step 4: Denoise
        gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
        
        # Step 5: Enhance contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        # Step 6: Adaptive binarization
        binary = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=15,
            C=10
        )
        
        # Step 7: Morphological cleaning
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
        
        # Step 8: Scale detection
        scale_mpp = file_info.get("scale_override")
        scale_confidence = 1.0 if scale_mpp else 0.0
        
        if not scale_mpp:
            scale_mpp, scale_confidence = self._detect_scale(image, gray)
        
        result.floor_plan_images.append({
            "image": image,
            "gray": gray,
            "binary": binary,
            "scale_meters_per_pixel": scale_mpp,
            "scale_confidence": scale_confidence,
            "source_id": file_info.get("id"),
            "source_filename": file_info.get("filename"),
        })
        
        # Update global scale if this is the best
        if scale_confidence > result.scale_confidence:
            result.detected_scale = scale_mpp
            result.scale_confidence = scale_confidence
    
    def _deskew(self, gray: np.ndarray) -> np.ndarray:
        """
        Deskew a scanned image by detecting the dominant line angle.
        Uses Hough Transform to find the most common line orientation.
        """
        # Detect edges
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # Hough lines
        lines = cv2.HoughLinesP(
            edges, rho=1, theta=np.pi/180,
            threshold=100, minLineLength=100, maxLineGap=10
        )
        
        if lines is None or len(lines) < 5:
            return gray
        
        # Calculate angles of all lines
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            # Normalize to [-45, 45] range
            angle = angle % 90
            if angle > 45:
                angle -= 90
            angles.append(angle)
        
        # Median angle (robust to outliers)
        median_angle = np.median(angles)
        
        # Only deskew if angle is significant (> 0.5 degrees)
        if abs(median_angle) < 0.5:
            return gray
        
        # Rotate image
        h, w = gray.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            gray, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        
        logger.info(f"Deskewed by {median_angle:.2f} degrees")
        return rotated
    
    def _detect_scale(self, image: np.ndarray, gray: np.ndarray) -> tuple:
        """
        Attempt to detect the scale of a floor plan image.
        
        Methods tried in order:
        1. OCR for scale bar text ("1:100", "1cm = 1m", etc.)
        2. Look for dimension annotations with measurements
        3. Look for standard door width (0.9m) as reference
        
        Returns: (meters_per_pixel, confidence)
        """
        # Method 1: OCR for scale indicators
        # TODO: Integrate PaddleOCR here
        
        # Method 2: Dimension text
        # TODO: Parse dimension annotations
        
        # For MVP: return None (require user input)
        return None, 0.0
    
    def _process_room_photo(self, file_info: dict, result: PreprocessedData):
        """Process a room photo for layout estimation."""
        logger.info("Processing room photo", file=file_info.get("filename"))
        
        image_bytes = self._download_file(file_info["storage_path"])
        image = cv2.imdecode(
            np.frombuffer(image_bytes, np.uint8),
            cv2.IMREAD_COLOR
        )
        
        if image is None:
            return
        
        # Basic preprocessing for room photos
        # Resize to standard input size for ML models
        h, w = image.shape[:2]
        if max(h, w) > 1920:
            scale = 1920 / max(h, w)
            image = cv2.resize(image, None, fx=scale, fy=scale)
        
        result.room_photos.append({
            "image": image,
            "source_id": file_info.get("id"),
            "source_filename": file_info.get("filename"),
        })
    
    def _process_pdf(self, file_info: dict, result: PreprocessedData):
        """
        PDF processing pipeline:
        1. Determine if vector or raster PDF
        2. Extract vector paths (if vector)
        3. Extract images (if raster)
        4. Extract text annotations
        """
        logger.info("Processing PDF", file=file_info.get("filename"))
        
        pdf_bytes = self._download_file(file_info["storage_path"])
        
        import fitz  # PyMuPDF
        
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        for page_num, page in enumerate(doc):
            # Analyze page content
            has_drawings = len(page.get_drawings()) > 0
            has_images = len(page.get_images()) > 0
            
            if has_drawings:
                # Vector PDF — extract geometry directly
                self._extract_vector_geometry(page, file_info, result)
            
            if has_images and not has_drawings:
                # Raster PDF — extract images and process as floor plan
                self._extract_raster_images(page, page_num, file_info, result)
            
            # Always extract text (for dimensions, labels)
            text_blocks = page.get_text("blocks")
            # Store for later use in spatial model construction
        
        doc.close()
    
    def _extract_vector_geometry(self, page, file_info: dict, result: PreprocessedData):
        """Extract vector paths from a PDF page."""
        drawings = page.get_drawings()
        
        lines = []
        rects = []
        curves = []
        
        for drawing in drawings:
            for item in drawing["items"]:
                if item[0] == "l":  # Line
                    p1, p2 = item[1], item[2]
                    lines.append({
                        "x1": p1.x, "y1": p1.y,
                        "x2": p2.x, "y2": p2.y,
                        "width": drawing.get("width", 1.0),
                    })
                elif item[0] == "re":  # Rectangle
                    rect = item[1]
                    rects.append({
                        "x": rect.x0, "y": rect.y0,
                        "w": rect.width, "h": rect.height,
                    })
                elif item[0] == "c":  # Curve
                    curves.append({
                        "points": [(p.x, p.y) for p in item[1:]],
                    })
        
        if lines or rects:
            result.vector_geometries.append({
                "lines": lines,
                "rects": rects,
                "curves": curves,
                "page_width": page.rect.width,
                "page_height": page.rect.height,
                "source_id": file_info.get("id"),
            })
    
    def _extract_raster_images(self, page, page_num: int, file_info: dict, result: PreprocessedData):
        """Extract embedded images from a PDF page."""
        images = page.get_images(full=True)
        
        for img_index, img_info in enumerate(images):
            xref = img_info[0]
            pix = page.parent.extract_image(xref)
            if pix:
                image_bytes = pix["image"]
                # Process as floor plan image
                modified_file_info = {
                    **file_info,
                    "storage_path": None,  # Already have bytes
                    "_image_bytes": image_bytes,
                    "filename": f"{file_info.get('filename', 'pdf')}_p{page_num}_img{img_index}",
                }
                # Convert to OpenCV format and add to floor plan images
                nparr = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if image is not None:
                    result.floor_plan_images.append({
                        "image": image,
                        "gray": cv2.cvtColor(image, cv2.COLOR_BGR2GRAY),
                        "binary": None,  # Will be computed in wall detection
                        "scale_meters_per_pixel": None,
                        "scale_confidence": 0.0,
                        "source_id": file_info.get("id"),
                        "source_filename": modified_file_info["filename"],
                    })
    
    def _process_cad(self, file_info: dict, result: PreprocessedData):
        """Process DXF/DWG CAD files."""
        logger.info("Processing CAD file", file=file_info.get("filename"))
        
        cad_bytes = self._download_file(file_info["storage_path"])
        
        import ezdxf
        
        doc = ezdxf.read(io.BytesIO(cad_bytes))
        msp = doc.modelspace()
        
        lines = []
        texts = []
        
        for entity in msp:
            if entity.dxftype() == "LINE":
                lines.append({
                    "x1": entity.dxf.start.x,
                    "y1": entity.dxf.start.y,
                    "x2": entity.dxf.end.x,
                    "y2": entity.dxf.end.y,
                    "layer": entity.dxf.layer,
                })
            elif entity.dxftype() == "LWPOLYLINE":
                points = list(entity.get_points(format="xy"))
                for i in range(len(points) - 1):
                    lines.append({
                        "x1": points[i][0], "y1": points[i][1],
                        "x2": points[i+1][0], "y2": points[i+1][1],
                        "layer": entity.dxf.layer,
                    })
                if entity.closed and len(points) > 2:
                    lines.append({
                        "x1": points[-1][0], "y1": points[-1][1],
                        "x2": points[0][0], "y2": points[0][1],
                        "layer": entity.dxf.layer,
                    })
            elif entity.dxftype() in ("TEXT", "MTEXT"):
                texts.append({
                    "text": entity.dxf.text if hasattr(entity.dxf, 'text') else str(entity.text),
                    "x": entity.dxf.insert.x if hasattr(entity.dxf, 'insert') else 0,
                    "y": entity.dxf.insert.y if hasattr(entity.dxf, 'insert') else 0,
                    "layer": entity.dxf.layer,
                })
        
        if lines:
            result.vector_geometries.append({
                "lines": lines,
                "texts": texts,
                "source_type": "cad",
                "source_id": file_info.get("id"),
                "units": doc.header.get("$INSUNITS", 0),  # 0=unitless, 1=inches, 4=mm, 6=meters
            })
    
    def _process_lidar(self, file_info: dict, result: PreprocessedData):
        """Process LiDAR point cloud data."""
        logger.info("Processing LiDAR scan", file=file_info.get("filename"))
        # TODO: Implement with Open3D
        pass
    
    def _auto_classify_and_process(self, file_info: dict, result: PreprocessedData):
        """Auto-classify file type and route to appropriate processor."""
        filename = file_info.get("filename", "").lower()
        
        if filename.endswith((".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp")):
            # Use ML classifier to determine if floor plan or room photo
            # For MVP: assume floor plan
            self._process_floor_plan_image(file_info, result)
        elif filename.endswith(".pdf"):
            self._process_pdf(file_info, result)
        elif filename.endswith((".dxf", ".dwg")):
            self._process_cad(file_info, result)
        elif filename.endswith((".las", ".laz", ".e57", ".ply")):
            self._process_lidar(file_info, result)
        else:
            logger.warning("Unsupported file type, skipping", file=filename)
    
    def _load_project_files(self, project_id: str) -> List[dict]:
        """Load project file records from database (sync)."""
        from sqlalchemy import create_engine, text
        from app.config import settings
        
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        engine = create_engine(sync_url)
        
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT * FROM project_files WHERE project_id = :pid AND status = 'uploaded'"),
                {"pid": project_id}
            )
            files = [dict(row._mapping) for row in result]
        
        return files
    
    def _download_file(self, storage_path: str) -> bytes:
        """Download file from object storage (sync)."""
        from minio import Minio
        from app.config import settings
        
        client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        
        response = client.get_object(settings.MINIO_BUCKET, storage_path)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()
