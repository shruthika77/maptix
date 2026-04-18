"""
Stage 3: Room Segmentation

Identifies rooms (enclosed spaces) from detected walls.
"""

import uuid
import numpy as np
import cv2
from typing import List, Dict
from dataclasses import dataclass, field
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import structlog

logger = structlog.get_logger()


@dataclass
class Room:
    """A detected room."""
    id: str = ""
    polygon: List[tuple] = field(default_factory=list)  # [(x,y), ...]
    area_sqm: float = 0.0
    perimeter_m: float = 0.0
    room_type: str = "unknown"
    label: str = ""
    confidence: float = 0.0
    centroid: tuple = (0, 0)


@dataclass
class RoomSegmentationResult:
    """Result of room segmentation."""
    rooms: List[Room] = field(default_factory=list)


class RoomSegmenter:
    """
    Room segmentation using multiple approaches:
    
    MVP: Flood fill on wall bitmap
    Advanced: Semantic segmentation with ML model
    """
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        self.min_room_area_sqm = 1.0  # Minimum room size (filter artifacts)
        self.max_room_area_sqm = 500.0  # Maximum room size (filter exterior)
    
    def segment(self, preprocessed, walls) -> RoomSegmentationResult:
        """Segment rooms from preprocessed data and detected walls."""
        result = RoomSegmentationResult()
        
        # Strategy 1: Flood fill on raster data
        if preprocessed.floor_plan_images:
            for fp_data in preprocessed.floor_plan_images:
                rooms = self._segment_flood_fill(fp_data, walls)
                result.rooms.extend(rooms)
        
        # Strategy 2: From vector geometry (closed polygons)
        if preprocessed.vector_geometries:
            for vec_data in preprocessed.vector_geometries:
                rooms = self._segment_from_vectors(vec_data, walls)
                result.rooms.extend(rooms)
        
        # Classify room types
        for room in result.rooms:
            room.room_type = self._classify_room(room)
        
        logger.info(f"Segmented {len(result.rooms)} rooms")
        return result
    
    def _segment_flood_fill(self, fp_data: dict, walls) -> List[Room]:
        """
        Room segmentation using flood fill:
        1. Create a binary image with walls drawn
        2. Flood fill from non-wall regions
        3. Each connected region = potential room
        4. Extract contours → room polygons
        """
        binary = fp_data.get("binary")
        if binary is None:
            return []
        
        h, w = binary.shape[:2]
        scale = fp_data.get("scale_meters_per_pixel")
        
        # Create wall mask (dilate walls slightly to ensure they're connected)
        wall_mask = binary.copy()
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        wall_mask = cv2.dilate(wall_mask, kernel, iterations=2)
        
        # Invert: walls=0, rooms=255
        room_mask = cv2.bitwise_not(wall_mask)
        
        # Find connected components (each = potential room)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
            room_mask, connectivity=4
        )
        
        rooms = []
        
        for label_idx in range(1, num_labels):  # Skip background (0)
            # Get component stats
            area_px = stats[label_idx, cv2.CC_STAT_AREA]
            
            # Filter by area
            if scale:
                area_sqm = area_px * (scale ** 2)
            else:
                area_sqm = area_px  # No scale: area in pixels
            
            if area_sqm < self.min_room_area_sqm:
                continue
            if area_sqm > self.max_room_area_sqm:
                continue
            
            # Extract contour for this component
            component_mask = (labels == label_idx).astype(np.uint8) * 255
            contours, _ = cv2.findContours(
                component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            
            if not contours:
                continue
            
            # Take the largest contour
            contour = max(contours, key=cv2.contourArea)
            
            # Simplify contour (Douglas-Peucker)
            epsilon = 0.02 * cv2.arcLength(contour, True)
            simplified = cv2.approxPolyDP(contour, epsilon, True)
            
            if len(simplified) < 3:
                continue
            
            # Convert contour to polygon coordinates
            polygon_points = []
            for point in simplified:
                px, py = point[0]
                if scale:
                    polygon_points.append((px * scale, py * scale))
                else:
                    polygon_points.append((float(px), float(py)))
            
            # Create Shapely polygon for area/perimeter calculation
            try:
                shapely_poly = Polygon(polygon_points)
                if not shapely_poly.is_valid:
                    shapely_poly = shapely_poly.buffer(0)  # Fix invalid geometry
                if shapely_poly.is_empty:
                    continue
            except Exception:
                continue
            
            centroid = shapely_poly.centroid
            
            room = Room(
                id=str(uuid.uuid4()),
                polygon=polygon_points,
                area_sqm=shapely_poly.area if scale else area_px,
                perimeter_m=shapely_poly.length if scale else cv2.arcLength(contour, True),
                confidence=0.7,
                centroid=(centroid.x, centroid.y),
            )
            
            rooms.append(room)
        
        return rooms
    
    def _segment_from_vectors(self, vec_data: dict, walls) -> List[Room]:
        """
        Room segmentation from vector data.
        Look for closed polygons or use wall graph to find enclosed areas.
        """
        # TODO: Build wall graph, find cycles (enclosed rooms)
        return []
    
    def _classify_room(self, room: Room) -> str:
        """
        Classify room type based on:
        1. Area (heuristic ranges)
        2. Detected fixtures
        3. OCR labels (if available)
        4. Shape (aspect ratio)
        """
        area = room.area_sqm
        
        # Simple area-based heuristics (for MVP)
        if area < 3:
            return "closet"
        elif area < 6:
            return "bathroom"
        elif area < 10:
            return "bedroom"
        elif area < 20:
            return "living_room"
        elif area < 30:
            return "living_room"
        else:
            return "unknown"
