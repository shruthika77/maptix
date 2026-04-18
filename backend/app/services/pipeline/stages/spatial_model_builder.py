"""
Stage 5: Unified Spatial Model Builder

Combines all detection results into the canonical Unified Spatial Model (JSON).
Handles multi-source fusion, conflict resolution, and data normalization.
"""

import uuid
from typing import Dict, List, Optional
from dataclasses import asdict
import structlog

logger = structlog.get_logger()


class SpatialModelBuilder:
    """
    Builds the Unified Spatial Model from detection results.
    
    The output matches the schema defined in:
    docs/schemas/spatial-model.schema.json
    """
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        self.default_wall_height = self.options.get("default_wall_height_m", 2.7)
        self.default_wall_thickness = self.options.get("default_wall_thickness_m", 0.15)
    
    def build(
        self,
        walls,
        rooms,
        objects,
        preprocessed,
    ) -> dict:
        """Build the complete Unified Spatial Model."""
        
        # Build floor data (MVP: single floor)
        floor = self._build_floor(
            level=0,
            walls=walls,
            rooms=rooms,
            objects=objects,
        )
        
        # Build metadata
        metadata = self._build_metadata(preprocessed, [floor])
        
        # Construct the model
        spatial_model = {
            "version": "1.0.0",
            "metadata": metadata,
            "floors": [floor],
            "inter_floor_elements": [],
        }
        
        # Associate objects with walls and rooms
        self._link_elements(spatial_model)
        
        logger.info(
            "Built spatial model",
            walls=len(floor.get("walls", [])),
            rooms=len(floor.get("rooms", [])),
            doors=len(floor.get("doors", [])),
            windows=len(floor.get("windows", [])),
        )
        
        return spatial_model
    
    def _build_floor(self, level: int, walls, rooms, objects) -> dict:
        """Build a single floor's spatial data."""
        
        # Convert walls
        wall_list = []
        for wall in walls.walls:
            wall_dict = {
                "id": wall.id or str(uuid.uuid4()),
                "start": {"x": round(wall.x1, 4), "y": round(wall.y1, 4)},
                "end": {"x": round(wall.x2, 4), "y": round(wall.y2, 4)},
                "thickness_m": wall.thickness or self.default_wall_thickness,
                "type": wall.wall_type,
                "confidence": round(wall.confidence, 3),
                "source": wall.source,
                "openings": [],
                "connected_walls": [],
            }
            wall_list.append(wall_dict)
        
        # Convert rooms
        room_list = []
        for room in rooms.rooms:
            vertices = [{"x": round(p[0], 4), "y": round(p[1], 4)} for p in room.polygon]
            room_dict = {
                "id": room.id or str(uuid.uuid4()),
                "polygon": {"vertices": vertices},
                "area_sqm": round(room.area_sqm, 2),
                "perimeter_m": round(room.perimeter_m, 2),
                "type": room.room_type,
                "label": room.label or f"Room {len(room_list) + 1}",
                "ceiling_height_m": self.default_wall_height,
                "confidence": round(room.confidence, 3),
                "wall_ids": [],
                "door_ids": [],
                "window_ids": [],
                "connected_rooms": [],
            }
            room_list.append(room_dict)
        
        # Convert doors
        door_list = []
        for door in objects.doors:
            door_dict = {
                "id": door.id or str(uuid.uuid4()),
                "position": {"x": round(door.x, 4), "y": round(door.y, 4)},
                "width_m": round(door.width_m, 2),
                "height_m": round(door.height_m, 2),
                "type": door.properties.get("type", "unknown"),
                "swing_direction": door.properties.get("swing_direction", "unknown"),
                "confidence": round(door.confidence, 3),
                "wall_id": None,
                "connects_rooms": [],
            }
            door_list.append(door_dict)
        
        # Convert windows
        window_list = []
        for window in objects.windows:
            window_dict = {
                "id": window.id or str(uuid.uuid4()),
                "position": {"x": round(window.x, 4), "y": round(window.y, 4)},
                "width_m": round(window.width_m, 2),
                "height_m": round(window.height_m, 2),
                "sill_height_m": 0.9,
                "type": "unknown",
                "confidence": round(window.confidence, 3),
                "wall_id": None,
            }
            window_list.append(window_dict)
        
        return {
            "level": level,
            "label": "Ground Floor" if level == 0 else f"Floor {level}",
            "elevation_m": level * self.default_wall_height,
            "height_m": self.default_wall_height,
            "walls": wall_list,
            "rooms": room_list,
            "doors": door_list,
            "windows": window_list,
            "columns": [],
            "annotations": [],
        }
    
    def _build_metadata(self, preprocessed, floors: List[dict]) -> dict:
        """Build model metadata."""
        # Calculate bounding box
        all_points = []
        for floor in floors:
            for wall in floor.get("walls", []):
                all_points.append((wall["start"]["x"], wall["start"]["y"]))
                all_points.append((wall["end"]["x"], wall["end"]["y"]))
        
        if all_points:
            xs = [p[0] for p in all_points]
            ys = [p[1] for p in all_points]
            bbox = {
                "min": {"x": min(xs), "y": min(ys), "z": 0},
                "max": {"x": max(xs), "y": max(ys), "z": self.default_wall_height},
            }
        else:
            bbox = {"min": {"x": 0, "y": 0, "z": 0}, "max": {"x": 0, "y": 0, "z": 0}}
        
        # Total area
        total_area = sum(
            room.get("area_sqm", 0)
            for floor in floors
            for room in floor.get("rooms", [])
        )
        
        # Average confidence
        all_confidences = []
        for floor in floors:
            for wall in floor.get("walls", []):
                all_confidences.append(wall.get("confidence", 0))
            for room in floor.get("rooms", []):
                all_confidences.append(room.get("confidence", 0))
        
        avg_confidence = (
            sum(all_confidences) / len(all_confidences)
            if all_confidences else 0
        )
        
        return {
            "project_id": preprocessed.project_id,
            "created_at": None,  # Will be set by DB
            "sources": [
                {
                    "file_id": fp.get("source_id"),
                    "type": "floor_plan_image",
                    "confidence": fp.get("scale_confidence", 0),
                }
                for fp in preprocessed.floor_plan_images
            ],
            "coordinate_system": {
                "units": "meters" if preprocessed.detected_scale else "pixels",
                "origin": {"x": 0, "y": 0, "z": 0},
                "up_axis": "Y",
            },
            "bounding_box": bbox,
            "total_area_sqm": round(total_area, 2),
        }
    
    def _link_elements(self, spatial_model: dict):
        """
        Create relationships between elements:
        - Associate doors/windows with walls (nearest wall)
        - Associate walls/doors/windows with rooms (containment)
        - Build room connectivity graph (rooms connected by doors)
        """
        for floor in spatial_model.get("floors", []):
            walls = floor.get("walls", [])
            rooms = floor.get("rooms", [])
            doors = floor.get("doors", [])
            windows = floor.get("windows", [])
            
            # Associate doors with nearest wall
            for door in doors:
                nearest_wall = self._find_nearest_wall(
                    door["position"]["x"], door["position"]["y"], walls
                )
                if nearest_wall:
                    door["wall_id"] = nearest_wall["id"]
                    nearest_wall["openings"].append({
                        "type": "door",
                        "ref_id": door["id"],
                    })
            
            # Associate windows with nearest wall
            for window in windows:
                nearest_wall = self._find_nearest_wall(
                    window["position"]["x"], window["position"]["y"], walls
                )
                if nearest_wall:
                    window["wall_id"] = nearest_wall["id"]
                    nearest_wall["openings"].append({
                        "type": "window",
                        "ref_id": window["id"],
                    })
            
            # Associate elements with rooms
            for room in rooms:
                room_polygon = room["polygon"]["vertices"]
                
                for door in doors:
                    if self._point_near_polygon(
                        door["position"]["x"], door["position"]["y"],
                        room_polygon, tolerance=1.0
                    ):
                        room["door_ids"].append(door["id"])
                        if door["id"] not in [r for r in door.get("connects_rooms", [])]:
                            door.setdefault("connects_rooms", []).append(room["id"])
    
    def _find_nearest_wall(self, x: float, y: float, walls: list) -> Optional[dict]:
        """Find the nearest wall to a point."""
        min_dist = float("inf")
        nearest = None
        
        for wall in walls:
            # Distance from point to line segment
            dist = self._point_to_segment_distance(
                x, y,
                wall["start"]["x"], wall["start"]["y"],
                wall["end"]["x"], wall["end"]["y"],
            )
            if dist < min_dist:
                min_dist = dist
                nearest = wall
        
        return nearest
    
    def _point_to_segment_distance(
        self, px, py, x1, y1, x2, y2
    ) -> float:
        """Calculate shortest distance from point to line segment."""
        import math
        
        dx = x2 - x1
        dy = y2 - y1
        length_sq = dx * dx + dy * dy
        
        if length_sq == 0:
            return math.sqrt((px - x1)**2 + (py - y1)**2)
        
        t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / length_sq))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy
        
        return math.sqrt((px - proj_x)**2 + (py - proj_y)**2)
    
    def _point_near_polygon(
        self, px: float, py: float, vertices: list, tolerance: float
    ) -> bool:
        """Check if a point is near (within tolerance of) a polygon boundary."""
        for i in range(len(vertices)):
            j = (i + 1) % len(vertices)
            dist = self._point_to_segment_distance(
                px, py,
                vertices[i]["x"], vertices[i]["y"],
                vertices[j]["x"], vertices[j]["y"],
            )
            if dist < tolerance:
                return True
        return False
