"""
Stage 4: Object Detection

Detects doors, windows, and other structural elements.
"""

import uuid
import numpy as np
import cv2
from typing import List, Dict
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


@dataclass
class DetectedObject:
    """A detected structural element."""
    id: str = ""
    object_type: str = ""  # door, window, staircase, column
    x: float = 0
    y: float = 0
    width_m: float = 0
    height_m: float = 0
    rotation: float = 0
    confidence: float = 0
    properties: dict = field(default_factory=dict)


@dataclass
class ObjectDetectionResult:
    """Result of object detection."""
    doors: List[DetectedObject] = field(default_factory=list)
    windows: List[DetectedObject] = field(default_factory=list)
    stairs: List[DetectedObject] = field(default_factory=list)
    columns: List[DetectedObject] = field(default_factory=list)
    other: List[DetectedObject] = field(default_factory=list)


class ObjectDetector:
    """
    Detects structural objects in floor plans.
    
    Door Detection (Floor Plans):
    - Look for arc patterns (door swing indicators)
    - Look for wall gaps with specific width (0.7-1.2m)
    - Pattern: gap in wall + quarter-circle arc
    
    Window Detection (Floor Plans):
    - Look for specific patterns within wall segments
    - Pattern: parallel short lines crossing wall
    
    For room photos: Uses YOLOv8 (via ML service).
    """
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        # Default dimensions in meters
        self.door_width_range = (0.7, 1.5)
        self.window_width_range = (0.5, 3.0)
    
    def detect(self, preprocessed, walls) -> ObjectDetectionResult:
        """Detect objects from preprocessed data."""
        result = ObjectDetectionResult()
        
        # Detect from floor plan images
        for fp_data in preprocessed.floor_plan_images:
            doors = self._detect_doors_floorplan(fp_data, walls)
            windows = self._detect_windows_floorplan(fp_data, walls)
            result.doors.extend(doors)
            result.windows.extend(windows)
        
        # Detect from room photos (ML-based)
        for photo_data in preprocessed.room_photos:
            photo_objects = self._detect_objects_photo(photo_data)
            result.doors.extend(photo_objects.get("doors", []))
            result.windows.extend(photo_objects.get("windows", []))
        
        logger.info(
            f"Detected {len(result.doors)} doors, "
            f"{len(result.windows)} windows"
        )
        return result
    
    def _detect_doors_floorplan(self, fp_data: dict, walls) -> List[DetectedObject]:
        """
        Detect doors in floor plan images.
        
        Algorithm:
        1. Detect arcs (quarter circles) — door swing indicators
        2. For each arc, find the nearest wall gap
        3. Verify gap width is in standard door range
        4. Record door position, width, and swing direction
        """
        binary = fp_data.get("binary")
        if binary is None:
            return []
        
        scale = fp_data.get("scale_meters_per_pixel")
        doors = []
        
        # Method 1: Arc detection using Hough circles
        arcs = self._detect_arcs(binary)
        
        for arc in arcs:
            cx, cy, radius = arc
            
            # Estimate door width from arc radius
            width_px = radius
            width_m = width_px * scale if scale else width_px
            
            # Check if width is in standard door range
            if scale and not (self.door_width_range[0] <= width_m <= self.door_width_range[1]):
                continue
            
            door = DetectedObject(
                id=str(uuid.uuid4()),
                object_type="door",
                x=cx * scale if scale else cx,
                y=cy * scale if scale else cy,
                width_m=width_m if scale else width_px,
                height_m=2.1,  # Standard door height
                confidence=0.7,
                properties={
                    "type": "single_swing",
                    "swing_direction": "unknown",
                },
            )
            doors.append(door)
        
        # Method 2: Wall gap detection
        gap_doors = self._detect_wall_gaps(fp_data, walls)
        doors.extend(gap_doors)
        
        return doors
    
    def _detect_arcs(self, binary: np.ndarray) -> List[tuple]:
        """
        Detect arc patterns (door swings) in binary image.
        Uses Hough Circle Transform with partial circle detection.
        """
        # Thin the image to get skeleton (arcs become thin curves)
        thinned = cv2.ximgproc.thinning(binary) if hasattr(cv2, 'ximgproc') else binary
        
        # Detect circles (arcs appear as partial circles)
        circles = cv2.HoughCircles(
            thinned,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=20,
            param1=50,
            param2=30,
            minRadius=10,
            maxRadius=100,
        )
        
        arcs = []
        if circles is not None:
            for circle in circles[0]:
                cx, cy, r = circle
                arcs.append((float(cx), float(cy), float(r)))
        
        return arcs
    
    def _detect_wall_gaps(self, fp_data: dict, walls) -> List[DetectedObject]:
        """
        Detect doors by finding gaps in walls.
        A gap = section of wall with no pixels.
        """
        # TODO: Implement wall-gap-based door detection
        return []
    
    def _detect_windows_floorplan(self, fp_data: dict, walls) -> List[DetectedObject]:
        """
        Detect windows in floor plan images.
        
        Common window representations:
        - Three parallel short lines crossing a wall
        - Small rectangles within wall thickness
        - Dashed lines in wall
        """
        # TODO: Implement pattern-based window detection
        windows = []
        return windows
    
    def _detect_objects_photo(self, photo_data: dict) -> Dict[str, List[DetectedObject]]:
        """
        Detect objects in room photos using YOLOv8 (via ML service).
        """
        # TODO: Call ML service for YOLOv8 inference
        return {"doors": [], "windows": []}
