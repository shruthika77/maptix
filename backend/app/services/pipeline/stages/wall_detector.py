"""
Stage 2: Wall Detection

Detects wall segments from preprocessed floor plan data using
a combination of classical computer vision and ML techniques.
"""

import numpy as np
import cv2
from typing import List, Dict, Tuple
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


@dataclass
class WallSegment:
    """A detected wall segment."""
    id: str = ""
    x1: float = 0
    y1: float = 0
    x2: float = 0
    y2: float = 0
    thickness: float = 0.15  # meters
    confidence: float = 0.0
    source: str = ""
    wall_type: str = "unknown"  # exterior, interior, partition


@dataclass
class WallDetectionResult:
    """Result of wall detection stage."""
    walls: List[WallSegment] = field(default_factory=list)
    junctions: List[dict] = field(default_factory=list)
    wall_image: np.ndarray = None  # Binary image of detected walls
    

class WallDetector:
    """
    Wall detection using multiple approaches:
    
    1. Line Segment Detection (LSD) — fast, parameter-free
    2. Hough Transform — robust, well-understood
    3. ML Segmentation — accurate, needs GPU
    
    The detector uses an ensemble approach: run multiple methods,
    merge results, and score by agreement.
    """
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        self.method = self.options.get("wall_detection_method", "auto")
        self.min_wall_length_px = 30  # Minimum wall length in pixels
        self.angle_tolerance = 5.0  # Degrees tolerance for line merging
        self.distance_tolerance = 10  # Pixels tolerance for parallel detection
    
    def detect(self, preprocessed) -> WallDetectionResult:
        """Detect walls from all preprocessed inputs."""
        result = WallDetectionResult()
        
        # Process floor plan images (raster)
        for fp_data in preprocessed.floor_plan_images:
            walls = self._detect_walls_from_image(fp_data)
            result.walls.extend(walls)
        
        # Process vector geometries (PDF, CAD)
        for vec_data in preprocessed.vector_geometries:
            walls = self._detect_walls_from_vectors(vec_data)
            result.walls.extend(walls)
        
        # Deduplicate and merge
        result.walls = self._merge_walls(result.walls)
        
        # Detect junctions
        result.junctions = self._detect_junctions(result.walls)
        
        logger.info(f"Detected {len(result.walls)} walls, {len(result.junctions)} junctions")
        return result
    
    def _detect_walls_from_image(self, fp_data: dict) -> List[WallSegment]:
        """Detect walls from a preprocessed floor plan image."""
        binary = fp_data.get("binary")
        gray = fp_data.get("gray")
        scale = fp_data.get("scale_meters_per_pixel")
        
        if binary is None:
            if gray is not None:
                binary = cv2.adaptiveThreshold(
                    gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY_INV, 15, 10
                )
            else:
                return []
        
        walls = []
        
        # Method 1: LSD (Line Segment Detector)
        lsd_lines = self._detect_lines_lsd(binary)
        
        # Method 2: Hough Transform
        hough_lines = self._detect_lines_hough(binary)
        
        # Merge results from both detectors
        merged_lines = self._ensemble_merge(lsd_lines, hough_lines)
        
        # Filter and classify lines as walls
        for line in merged_lines:
            x1, y1, x2, y2, conf = line
            length_px = np.sqrt((x2-x1)**2 + (y2-y1)**2)
            
            if length_px < self.min_wall_length_px:
                continue
            
            # Convert to meters if scale is known
            if scale:
                wall = WallSegment(
                    x1=x1 * scale, y1=y1 * scale,
                    x2=x2 * scale, y2=y2 * scale,
                    confidence=conf,
                    source=fp_data.get("source_id", ""),
                )
            else:
                wall = WallSegment(
                    x1=x1, y1=y1, x2=x2, y2=y2,
                    confidence=conf,
                    source=fp_data.get("source_id", ""),
                )
            
            walls.append(wall)
        
        # Post-processing: snap to grid, extend to intersections
        walls = self._regularize_walls(walls)
        
        return walls
    
    def _detect_lines_lsd(self, binary: np.ndarray) -> List[Tuple]:
        """
        Line Segment Detection using OpenCV's LSD.
        Returns: List of (x1, y1, x2, y2, confidence) tuples.
        """
        lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
        lines, widths, precs, nfas = lsd.detect(binary)
        
        if lines is None:
            return []
        
        result = []
        for i, line in enumerate(lines):
            x1, y1, x2, y2 = line[0]
            conf = float(precs[i][0]) if precs is not None else 0.5
            result.append((x1, y1, x2, y2, conf))
        
        return result
    
    def _detect_lines_hough(self, binary: np.ndarray) -> List[Tuple]:
        """
        Line detection using Probabilistic Hough Transform.
        Returns: List of (x1, y1, x2, y2, confidence) tuples.
        """
        # Apply edge detection first
        edges = cv2.Canny(binary, 50, 150, apertureSize=3)
        
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=50,
            minLineLength=self.min_wall_length_px,
            maxLineGap=15,
        )
        
        if lines is None:
            return []
        
        result = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            # Hough confidence based on line length
            length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
            conf = min(length / 200.0, 1.0)  # Normalize
            result.append((float(x1), float(y1), float(x2), float(y2), conf))
        
        return result
    
    def _ensemble_merge(
        self, 
        lsd_lines: List[Tuple], 
        hough_lines: List[Tuple]
    ) -> List[Tuple]:
        """
        Merge lines from multiple detectors.
        Lines detected by both methods get higher confidence.
        """
        if not lsd_lines and not hough_lines:
            return []
        
        all_lines = []
        
        # Add all LSD lines
        for line in lsd_lines:
            all_lines.append((*line[:4], line[4] * 0.6))  # Weight LSD at 0.6
        
        # Add Hough lines, boosting confidence if they match an LSD line
        for h_line in hough_lines:
            matched = False
            for i, existing in enumerate(all_lines):
                if self._lines_similar(h_line, existing):
                    # Average the two detections, boost confidence
                    avg_x1 = (h_line[0] + existing[0]) / 2
                    avg_y1 = (h_line[1] + existing[1]) / 2
                    avg_x2 = (h_line[2] + existing[2]) / 2
                    avg_y2 = (h_line[3] + existing[3]) / 2
                    boosted_conf = min(existing[4] + h_line[4] * 0.4, 1.0)
                    all_lines[i] = (avg_x1, avg_y1, avg_x2, avg_y2, boosted_conf)
                    matched = True
                    break
            
            if not matched:
                all_lines.append((*h_line[:4], h_line[4] * 0.4))
        
        # Merge collinear segments
        all_lines = self._merge_collinear(all_lines)
        
        return all_lines
    
    def _lines_similar(self, line1: Tuple, line2: Tuple, dist_thresh: float = 15) -> bool:
        """Check if two lines are approximately the same."""
        # Check if midpoints are close and angles are similar
        mid1 = ((line1[0]+line1[2])/2, (line1[1]+line1[3])/2)
        mid2 = ((line2[0]+line2[2])/2, (line2[1]+line2[3])/2)
        
        dist = np.sqrt((mid1[0]-mid2[0])**2 + (mid1[1]-mid2[1])**2)
        if dist > dist_thresh:
            return False
        
        angle1 = np.degrees(np.arctan2(line1[3]-line1[1], line1[2]-line1[0]))
        angle2 = np.degrees(np.arctan2(line2[3]-line2[1], line2[2]-line2[0]))
        
        angle_diff = abs(angle1 - angle2) % 180
        if angle_diff > 180:
            angle_diff = 360 - angle_diff
        
        return angle_diff < self.angle_tolerance
    
    def _merge_collinear(self, lines: List[Tuple]) -> List[Tuple]:
        """Merge collinear line segments that are close together."""
        if len(lines) <= 1:
            return lines
        
        merged = list(lines)
        changed = True
        
        while changed:
            changed = False
            new_merged = []
            used = set()
            
            for i in range(len(merged)):
                if i in used:
                    continue
                
                current = merged[i]
                
                for j in range(i + 1, len(merged)):
                    if j in used:
                        continue
                    
                    candidate = merged[j]
                    
                    combined = self._try_merge_segments(current, candidate)
                    if combined is not None:
                        current = combined
                        used.add(j)
                        changed = True
                
                new_merged.append(current)
                used.add(i)
            
            merged = new_merged
        
        return merged
    
    def _try_merge_segments(self, seg1: Tuple, seg2: Tuple) -> Tuple:
        """
        Try to merge two line segments if they are collinear and close.
        Returns merged segment or None.
        """
        # Check angle similarity
        angle1 = np.degrees(np.arctan2(seg1[3]-seg1[1], seg1[2]-seg1[0]))
        angle2 = np.degrees(np.arctan2(seg2[3]-seg2[1], seg2[2]-seg2[0]))
        
        angle_diff = abs(angle1 - angle2) % 180
        if min(angle_diff, 180 - angle_diff) > self.angle_tolerance:
            return None
        
        # Check if segments are on the same line (perpendicular distance)
        # Using point-to-line distance
        dx = seg1[2] - seg1[0]
        dy = seg1[3] - seg1[1]
        length = np.sqrt(dx*dx + dy*dy)
        if length < 1:
            return None
        
        # Distance from seg2's midpoint to seg1's line
        mid2 = ((seg2[0]+seg2[2])/2, (seg2[1]+seg2[3])/2)
        dist = abs(dy * mid2[0] - dx * mid2[1] + seg1[2]*seg1[1] - seg1[3]*seg1[0]) / length
        
        if dist > self.distance_tolerance:
            return None
        
        # Check if endpoints are close enough to merge
        points = [
            (seg1[0], seg1[1]), (seg1[2], seg1[3]),
            (seg2[0], seg2[1]), (seg2[2], seg2[3]),
        ]
        
        # Find the two most distant points (merged segment endpoints)
        max_dist = 0
        best_pair = (0, 1)
        for i in range(len(points)):
            for j in range(i+1, len(points)):
                d = np.sqrt((points[i][0]-points[j][0])**2 + (points[i][1]-points[j][1])**2)
                if d > max_dist:
                    max_dist = d
                    best_pair = (i, j)
        
        p1 = points[best_pair[0]]
        p2 = points[best_pair[1]]
        conf = max(seg1[4], seg2[4])
        
        return (p1[0], p1[1], p2[0], p2[1], conf)
    
    def _regularize_walls(self, walls: List[WallSegment]) -> List[WallSegment]:
        """
        Regularize wall segments:
        - Snap near-horizontal/vertical lines to exact H/V
        - Round coordinates to reasonable precision
        """
        for wall in walls:
            dx = wall.x2 - wall.x1
            dy = wall.y2 - wall.y1
            angle = np.degrees(np.arctan2(dy, dx)) % 180
            
            # Snap to horizontal (0° or 180°)
            if angle < 3 or angle > 177:
                avg_y = (wall.y1 + wall.y2) / 2
                wall.y1 = avg_y
                wall.y2 = avg_y
            # Snap to vertical (90°)
            elif abs(angle - 90) < 3:
                avg_x = (wall.x1 + wall.x2) / 2
                wall.x1 = avg_x
                wall.x2 = avg_x
        
        return walls
    
    def _detect_walls_from_vectors(self, vec_data: dict) -> List[WallSegment]:
        """Detect walls from vector geometry data (PDF/CAD)."""
        walls = []
        lines = vec_data.get("lines", [])
        
        # For CAD data, use layer names to classify
        wall_layers = {"wall", "walls", "a-wall", "a_wall", "mur", "wand"}
        
        for line in lines:
            layer = line.get("layer", "").lower()
            is_wall_layer = any(wl in layer for wl in wall_layers)
            
            wall = WallSegment(
                x1=line["x1"], y1=line["y1"],
                x2=line["x2"], y2=line["y2"],
                confidence=0.95 if is_wall_layer else 0.5,
                source=vec_data.get("source_id", ""),
                wall_type="unknown",
            )
            
            if is_wall_layer or line.get("width", 0) > 1.0:
                walls.append(wall)
        
        return walls
    
    def _merge_walls(self, walls: List[WallSegment]) -> List[WallSegment]:
        """Deduplicate and merge walls from multiple sources."""
        # Simple deduplication for now
        # TODO: Implement proper spatial merging with confidence weighting
        return walls
    
    def _detect_junctions(self, walls: List[WallSegment]) -> List[dict]:
        """
        Detect wall junctions (corners, T-joints, X-joints).
        
        A junction is where two or more walls meet or intersect.
        """
        junctions = []
        tolerance = 0.1  # meters (or pixels if no scale)
        
        for i in range(len(walls)):
            for j in range(i + 1, len(walls)):
                # Check all endpoint combinations
                endpoints_i = [(walls[i].x1, walls[i].y1), (walls[i].x2, walls[i].y2)]
                endpoints_j = [(walls[j].x1, walls[j].y1), (walls[j].x2, walls[j].y2)]
                
                for pi in endpoints_i:
                    for pj in endpoints_j:
                        dist = np.sqrt((pi[0]-pj[0])**2 + (pi[1]-pj[1])**2)
                        if dist < tolerance:
                            junctions.append({
                                "x": (pi[0] + pj[0]) / 2,
                                "y": (pi[1] + pj[1]) / 2,
                                "wall_ids": [walls[i].id, walls[j].id],
                                "type": "L",  # Will be refined later
                            })
        
        return junctions
