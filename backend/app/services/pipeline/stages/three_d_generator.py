"""
Stage 6-8: 3D Model Generation

Converts the Unified Spatial Model into a 3D mesh (glTF).
Handles wall extrusion, opening cutouts, floor/ceiling generation,
materials, and mesh optimization.
"""

import numpy as np
import trimesh
from typing import List, Dict, Tuple, Optional
import structlog

logger = structlog.get_logger()


class ThreeDGenerator:
    """
    3D geometry generation from the Unified Spatial Model.
    
    Pipeline:
    1. Extrude walls from 2D segments to 3D boxes
    2. Cut openings for doors and windows (CSG boolean)
    3. Generate floor and ceiling meshes
    4. Apply materials
    5. Optimize mesh (merge, LOD, compress)
    6. Export to glTF
    """
    
    def __init__(self, options: dict = None):
        self.options = options or {}
        self.generate_textures = self.options.get("generate_textures", False)
        self.target_lod = self.options.get("target_lod", "medium")
    
    def generate(self, spatial_model: dict) -> dict:
        """Generate 3D model from spatial model."""
        logger.info("Starting 3D generation")
        
        scene = trimesh.Scene()
        
        for floor_data in spatial_model.get("floors", []):
            floor_meshes = self._generate_floor_level(floor_data, spatial_model)
            for name, mesh in floor_meshes.items():
                scene.add_geometry(mesh, node_name=name)
        
        # Export to glTF bytes
        gltf_bytes = self._export_gltf(scene)
        
        result = {
            "scene": scene,
            "gltf_bytes": gltf_bytes,
            "stats": {
                "vertex_count": sum(
                    len(g.vertices) for g in scene.geometry.values()
                    if hasattr(g, 'vertices')
                ),
                "face_count": sum(
                    len(g.faces) for g in scene.geometry.values()
                    if hasattr(g, 'faces')
                ),
                "file_size_bytes": len(gltf_bytes) if gltf_bytes else 0,
            }
        }
        
        logger.info(
            "3D generation complete",
            vertices=result["stats"]["vertex_count"],
            faces=result["stats"]["face_count"],
        )
        
        return result
    
    def _generate_floor_level(self, floor_data: dict, spatial_model: dict) -> Dict[str, trimesh.Trimesh]:
        """Generate 3D geometry for a single floor level."""
        meshes = {}
        level = floor_data.get("level", 0)
        floor_height = floor_data.get("height_m", 2.7)
        elevation = floor_data.get("elevation_m", level * floor_height)
        
        # Generate wall meshes
        wall_meshes = []
        for i, wall in enumerate(floor_data.get("walls", [])):
            wall_mesh = self._extrude_wall(wall, floor_height, elevation)
            if wall_mesh is not None:
                wall_meshes.append(wall_mesh)
        
        if wall_meshes:
            # Merge all walls into one mesh for efficiency
            combined_walls = trimesh.util.concatenate(wall_meshes)
            
            # Apply wall material (light gray)
            combined_walls.visual.face_colors = [200, 200, 200, 255]
            meshes[f"walls_floor_{level}"] = combined_walls
        
        # Generate floor mesh
        for i, room in enumerate(floor_data.get("rooms", [])):
            floor_mesh = self._generate_room_floor(room, elevation)
            if floor_mesh is not None:
                # Different colors per room type
                color = self._get_room_color(room.get("type", "unknown"))
                floor_mesh.visual.face_colors = color
                meshes[f"floor_{level}_room_{i}"] = floor_mesh
            
            # Generate ceiling
            ceiling_mesh = self._generate_room_floor(room, elevation + floor_height)
            if ceiling_mesh is not None:
                ceiling_mesh.visual.face_colors = [240, 240, 240, 255]
                # Flip normals for ceiling (face downward)
                ceiling_mesh.faces = np.fliplr(ceiling_mesh.faces)
                meshes[f"ceiling_{level}_room_{i}"] = ceiling_mesh
        
        # Generate door openings (door frame visualization)
        for i, door in enumerate(floor_data.get("doors", [])):
            door_mesh = self._generate_door_frame(door, elevation)
            if door_mesh is not None:
                door_mesh.visual.face_colors = [139, 90, 43, 255]  # Brown
                meshes[f"door_{level}_{i}"] = door_mesh
        
        # Generate window frames
        for i, window in enumerate(floor_data.get("windows", [])):
            window_mesh = self._generate_window_frame(window, elevation)
            if window_mesh is not None:
                window_mesh.visual.face_colors = [135, 206, 235, 180]  # Light blue, semi-transparent
                meshes[f"window_{level}_{i}"] = window_mesh
        
        return meshes
    
    def _extrude_wall(
        self,
        wall: dict,
        height: float,
        elevation: float,
    ) -> Optional[trimesh.Trimesh]:
        """
        Extrude a 2D wall segment into a 3D box.
        
        A wall is defined by:
        - start point (x1, y1)
        - end point (x2, y2)
        - thickness
        - height
        
        We create a box aligned along the wall direction.
        """
        start = wall.get("start", {})
        end = wall.get("end", {})
        thickness = wall.get("thickness_m", 0.15)
        
        x1, y1 = start.get("x", 0), start.get("y", 0)
        x2, y2 = end.get("x", 0), end.get("y", 0)
        
        # Wall direction vector
        dx = x2 - x1
        dy = y2 - y1
        length = np.sqrt(dx*dx + dy*dy)
        
        if length < 0.01:  # Skip degenerate walls
            return None
        
        # Normalize direction
        nx = dx / length
        ny = dy / length
        
        # Perpendicular vector (for wall thickness)
        px = -ny
        py = nx
        
        half_t = thickness / 2
        
        # Four bottom corners of the wall
        corners_2d = [
            (x1 + px * half_t, y1 + py * half_t),   # Bottom-left-front
            (x1 - px * half_t, y1 - py * half_t),   # Bottom-left-back
            (x2 - px * half_t, y2 - py * half_t),   # Bottom-right-back
            (x2 + px * half_t, y2 + py * half_t),   # Bottom-right-front
        ]
        
        # Create 8 vertices (4 bottom + 4 top)
        vertices = []
        for cx, cy in corners_2d:
            vertices.append([cx, elevation, cy])          # Bottom (Y=elevation in 3D, Y-up)
            vertices.append([cx, elevation + height, cy])  # Top
        
        vertices = np.array(vertices, dtype=np.float64)
        
        # Create faces (12 triangles for 6 faces of the box)
        # Vertex layout: 0-1 (BLF bottom/top), 2-3 (BLB), 4-5 (BRB), 6-7 (BRF)
        faces = np.array([
            # Front face
            [0, 6, 7], [0, 7, 1],
            # Back face
            [2, 4, 5], [2, 5, 3],
            # Left face (start end cap)
            [0, 2, 3], [0, 3, 1],
            # Right face (end end cap)
            [6, 4, 5], [6, 5, 7],
            # Top face
            [1, 7, 5], [1, 5, 3],
            # Bottom face
            [0, 6, 4], [0, 4, 2],
        ], dtype=np.int64)
        
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        
        # Fix normals
        mesh.fix_normals()
        
        return mesh
    
    def _generate_room_floor(
        self,
        room: dict,
        y_position: float,
    ) -> Optional[trimesh.Trimesh]:
        """
        Generate a floor (or ceiling) mesh for a room.
        
        Uses earcut triangulation to convert the room polygon
        into a triangle mesh at the given Y position.
        """
        polygon = room.get("polygon", {})
        vertices_2d = polygon.get("vertices", [])
        
        if len(vertices_2d) < 3:
            return None
        
        # Convert to flat array for earcut
        coords = []
        for v in vertices_2d:
            coords.extend([v.get("x", 0), v.get("y", 0)])
        
        # Triangulate using earcut
        try:
            import earcut
            triangle_indices = earcut.earcut(coords)
        except Exception:
            # Fallback: simple fan triangulation
            triangle_indices = []
            for i in range(1, len(vertices_2d) - 1):
                triangle_indices.extend([0, i, i + 1])
        
        if not triangle_indices:
            return None
        
        # Create 3D vertices (floor is in XZ plane, Y is height)
        vertices_3d = []
        for v in vertices_2d:
            vertices_3d.append([v.get("x", 0), y_position, v.get("y", 0)])
        
        vertices_3d = np.array(vertices_3d, dtype=np.float64)
        faces = np.array(triangle_indices, dtype=np.int64).reshape(-1, 3)
        
        mesh = trimesh.Trimesh(vertices=vertices_3d, faces=faces)
        mesh.fix_normals()
        
        return mesh
    
    def _generate_door_frame(
        self,
        door: dict,
        elevation: float,
    ) -> Optional[trimesh.Trimesh]:
        """Generate a simple door frame mesh."""
        pos = door.get("position", {})
        width = door.get("width_m", 0.9)
        height = door.get("height_m", 2.1)
        
        x = pos.get("x", 0)
        y = pos.get("y", 0)
        
        # Simple box representing the door opening
        # In a full implementation, this would include frame geometry
        # and optionally the door leaf
        frame_thickness = 0.05
        frame_depth = 0.15
        
        # For now, create a flat plane to represent the door
        mesh = trimesh.creation.box(
            extents=[width, height, frame_thickness],
            transform=trimesh.transformations.translation_matrix(
                [x, elevation + height/2, y]
            )
        )
        
        return mesh
    
    def _generate_window_frame(
        self,
        window: dict,
        elevation: float,
    ) -> Optional[trimesh.Trimesh]:
        """Generate a simple window mesh (semi-transparent pane)."""
        pos = window.get("position", {})
        width = window.get("width_m", 1.2)
        height = window.get("height_m", 1.2)
        sill = window.get("sill_height_m", 0.9)
        
        x = pos.get("x", 0)
        y = pos.get("y", 0)
        
        # Create glass pane
        mesh = trimesh.creation.box(
            extents=[width, height, 0.02],  # Very thin
            transform=trimesh.transformations.translation_matrix(
                [x, elevation + sill + height/2, y]
            )
        )
        
        return mesh
    
    def _get_room_color(self, room_type: str) -> List[int]:
        """Get a color for a room type (RGBA)."""
        colors = {
            "living_room": [255, 248, 220, 255],   # Cornsilk
            "bedroom": [230, 230, 250, 255],        # Lavender
            "kitchen": [255, 228, 196, 255],         # Bisque
            "bathroom": [176, 224, 230, 255],        # Powder blue
            "toilet": [176, 224, 230, 255],
            "hallway": [245, 245, 220, 255],         # Beige
            "corridor": [245, 245, 220, 255],
            "closet": [210, 180, 140, 255],          # Tan
            "office": [240, 255, 240, 255],          # Honeydew
            "dining_room": [255, 239, 213, 255],     # Papaya whip
            "balcony": [144, 238, 144, 255],         # Light green
            "garage": [192, 192, 192, 255],          # Silver
            "unknown": [230, 230, 230, 255],         # Light gray
        }
        return colors.get(room_type, colors["unknown"])
    
    def _export_gltf(self, scene: trimesh.Scene) -> bytes:
        """Export the scene to glTF binary format (GLB)."""
        try:
            return scene.export(file_type="glb")
        except Exception as e:
            logger.error(f"Failed to export glTF: {e}")
            return None
