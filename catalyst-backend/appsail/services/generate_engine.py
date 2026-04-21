"""
Floor Plan Layout Generation Engine — shared by both authenticated and demo endpoints.

Extracted from the original FastAPI generate.py. Contains:
- Room type defaults and standards
- Natural language prompt parser
- Rule-based layout generator (two-strip arrangement)
- Wall, door, window generation algorithms

No database or framework dependencies — pure Python logic.
"""

import uuid
import re
import math
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field


# ── Data Classes (replacing Pydantic for framework independence) ──

@dataclass
class RoomSpec:
    name: str
    type: str = "unknown"
    width_m: Optional[float] = None
    length_m: Optional[float] = None
    area_sqm: Optional[float] = None
    count: int = 1


@dataclass
class FloorSpec:
    level: int = 0
    label: str = "Ground Floor"
    rooms: List[RoomSpec] = field(default_factory=list)
    height_m: float = 3.0


# ── Room type defaults (standard sizes in meters) ──

ROOM_DEFAULTS = {
    "living_room": {"width": 5.0, "length": 6.0, "min_area": 15},
    "bedroom": {"width": 4.0, "length": 4.5, "min_area": 10},
    "master_bedroom": {"width": 5.0, "length": 5.5, "min_area": 16},
    "kitchen": {"width": 3.5, "length": 4.0, "min_area": 8},
    "bathroom": {"width": 2.5, "length": 3.0, "min_area": 4},
    "toilet": {"width": 1.5, "length": 2.0, "min_area": 2.5},
    "dining_room": {"width": 4.0, "length": 5.0, "min_area": 12},
    "hallway": {"width": 1.5, "length": 5.0, "min_area": 5},
    "corridor": {"width": 1.8, "length": 8.0, "min_area": 6},
    "closet": {"width": 1.5, "length": 2.0, "min_area": 2},
    "study": {"width": 3.0, "length": 3.5, "min_area": 8},
    "balcony": {"width": 2.0, "length": 4.0, "min_area": 4},
    "garage": {"width": 3.5, "length": 6.0, "min_area": 18},
    "laundry": {"width": 2.5, "length": 3.0, "min_area": 5},
    "porch": {"width": 3.0, "length": 3.0, "min_area": 6},
    "office": {"width": 3.5, "length": 4.0, "min_area": 10},
    "guest_room": {"width": 3.5, "length": 4.0, "min_area": 10},
    "operation_theater": {"width": 6.0, "length": 7.0, "min_area": 35},
    "icu_room": {"width": 5.0, "length": 6.0, "min_area": 20},
    "private_room": {"width": 4.0, "length": 5.0, "min_area": 15},
    "ward": {"width": 6.0, "length": 8.0, "min_area": 30},
    "general_ward": {"width": 6.0, "length": 8.0, "min_area": 30},
    "labor_room": {"width": 4.5, "length": 5.5, "min_area": 18},
    "nurse_station": {"width": 3.0, "length": 4.0, "min_area": 8},
    "reception": {"width": 4.0, "length": 5.0, "min_area": 15},
    "waiting_area": {"width": 5.0, "length": 6.0, "min_area": 20},
    "pharmacy": {"width": 3.5, "length": 5.0, "min_area": 12},
    "store": {"width": 3.0, "length": 4.0, "min_area": 8},
    "sterilization_room": {"width": 3.0, "length": 4.0, "min_area": 10},
    "nicu_room": {"width": 4.0, "length": 5.0, "min_area": 15},
    "lab": {"width": 4.0, "length": 5.0, "min_area": 15},
    "x_ray_room": {"width": 4.0, "length": 5.0, "min_area": 15},
    "conference_room": {"width": 5.0, "length": 6.0, "min_area": 20},
    "cafeteria": {"width": 6.0, "length": 8.0, "min_area": 30},
    "lift": {"width": 2.0, "length": 2.0, "min_area": 3},
    "staircase": {"width": 3.0, "length": 3.0, "min_area": 6},
    "fhc": {"width": 2.0, "length": 2.5, "min_area": 3},
    "wazu_area": {"width": 2.5, "length": 3.0, "min_area": 5},
    "namaz_room": {"width": 4.0, "length": 5.0, "min_area": 12},
    "gown_change_room": {"width": 2.5, "length": 3.0, "min_area": 5},
    "scrub_area": {"width": 2.0, "length": 2.5, "min_area": 4},
    "unknown": {"width": 4.0, "length": 4.0, "min_area": 10},
}


# ── Text Prompt Parser ──

def parse_prompt(prompt: str, building_type: str = "residential") -> Tuple[List[FloorSpec], float, float]:
    """Parse a natural language prompt into structured room specifications."""
    prompt_lower = prompt.lower().strip()
    floors = []

    # Extract plot dimensions
    plot_width = None
    plot_length = None
    dim_match = re.search(r'(\d+)\s*[xX×]\s*(\d+)\s*(ft|feet|m|meter|metre)?', prompt)
    if dim_match:
        d1 = float(dim_match.group(1))
        d2 = float(dim_match.group(2))
        unit = dim_match.group(3) or 'ft'
        if 'ft' in unit or 'feet' in unit:
            d1 *= 0.3048
            d2 *= 0.3048
        plot_width = min(d1, d2)
        plot_length = max(d1, d2)

    # Check if multi-floor description
    has_floor_sections = bool(re.search(
        r'(ground\s*floor|first\s*floor|second\s*floor|floor\s*[01234])',
        prompt_lower
    ))

    if has_floor_sections:
        floor_sections = re.split(
            r'(?:ground\s*floor|first\s*floor|second\s*floor|third\s*floor|floor\s*\d)\s*[:;-]?\s*',
            prompt_lower
        )
        floor_labels_matches = re.findall(
            r'(ground\s*floor|first\s*floor|second\s*floor|third\s*floor|floor\s*\d)',
            prompt_lower
        )

        for i, label_match in enumerate(floor_labels_matches):
            section_text = floor_sections[i + 1] if i + 1 < len(floor_sections) else ""
            rooms = _extract_rooms(section_text, building_type)
            label = label_match.strip().title()
            floors.append(FloorSpec(level=i, label=label, rooms=rooms))
    else:
        rooms = _extract_rooms(prompt_lower, building_type)

        bhk_match = re.search(r'(\d)\s*bhk', prompt_lower)
        if bhk_match:
            num_bedrooms = int(bhk_match.group(1))
            bedroom_count = sum(1 for r in rooms if r.type in ('bedroom', 'master_bedroom'))
            if bedroom_count < num_bedrooms:
                for _ in range(num_bedrooms - bedroom_count):
                    rooms.append(RoomSpec(name="Bedroom", type="bedroom"))
            types_present = {r.type for r in rooms}
            if 'living_room' not in types_present and 'hall' not in types_present:
                rooms.insert(0, RoomSpec(name="Living Room", type="living_room"))
            if 'kitchen' not in types_present:
                rooms.append(RoomSpec(name="Kitchen", type="kitchen"))
            if 'bathroom' not in types_present and 'toilet' not in types_present:
                rooms.append(RoomSpec(name="Bathroom", type="bathroom"))

        if not rooms:
            rooms = _default_rooms(building_type)

        floors.append(FloorSpec(level=0, label="Ground Floor", rooms=rooms))

    # Estimate plot dimensions if not provided
    if not plot_width or not plot_length:
        total_area = 0
        for floor in floors:
            for room in floor.rooms:
                if room.area_sqm:
                    total_area += room.area_sqm * room.count
                else:
                    defaults = ROOM_DEFAULTS.get(room.type, ROOM_DEFAULTS["unknown"])
                    total_area += defaults["width"] * defaults["length"] * room.count
        total_area *= 1.3
        plot_length = math.sqrt(total_area * 1.5)
        plot_width = total_area / plot_length

    return floors, plot_width, plot_length


def _extract_rooms(text: str, building_type: str) -> List[RoomSpec]:
    """Extract room specifications from a text segment."""
    rooms = []

    room_patterns = [
        (r'operation\s*theat(?:er|re)', 'operation_theater', 'Operation Theater'),
        (r'general\s*ward', 'general_ward', 'General Ward'),
        (r'female\s*(?:general\s*)?ward', 'general_ward', 'Female General Ward'),
        (r'male\s*(?:general\s*)?ward', 'general_ward', 'Male General Ward'),
        (r'sterilization\s*room', 'sterilization_room', 'Sterilization Room'),
        (r'gown\s*change\s*room', 'gown_change_room', 'Gown Change Room'),
        (r'nurse\s*station', 'nurse_station', 'Nurse Station'),
        (r'master\s*bed\s*room', 'master_bedroom', 'Master Bedroom'),
        (r'living\s*room', 'living_room', 'Living Room'),
        (r'dining\s*room', 'dining_room', 'Dining Room'),
        (r'guest\s*room', 'guest_room', 'Guest Room'),
        (r'private\s*room', 'private_room', 'Private Room'),
        (r'labor\s*room', 'labor_room', 'Labor Room'),
        (r'conference\s*room', 'conference_room', 'Conference Room'),
        (r'namaz\s*room', 'namaz_room', 'Namaz Room'),
        (r'nicu\s*room', 'nicu_room', 'NICU Room'),
        (r'icu\s*room', 'icu_room', 'ICU Room'),
        (r'x[\s-]*ray\s*room', 'x_ray_room', 'X-Ray Room'),
        (r'waiting\s*area', 'waiting_area', 'Waiting Area'),
        (r'wazu\s*area', 'wazu_area', 'Wazu Area'),
        (r'scrub\s*area', 'scrub_area', 'Scrub Area'),
        (r'bed\s*lift', 'lift', 'Bed Lift'),
        (r'bed\s*room', 'bedroom', 'Bedroom'),
        (r'bath\s*room', 'bathroom', 'Bathroom'),
        (r'stair\s*case', 'staircase', 'Staircase'),
        (r'bedroom', 'bedroom', 'Bedroom'),
        (r'bathroom', 'bathroom', 'Bathroom'),
        (r'kitchen', 'kitchen', 'Kitchen'),
        (r'toilet', 'toilet', 'Toilet'),
        (r'hallway', 'hallway', 'Hallway'),
        (r'corridor', 'corridor', 'Corridor'),
        (r'closet', 'closet', 'Closet'),
        (r'garage', 'garage', 'Garage'),
        (r'balcony', 'balcony', 'Balcony'),
        (r'study', 'study', 'Study'),
        (r'office', 'office', 'Office'),
        (r'laundry', 'laundry', 'Laundry'),
        (r'porch', 'porch', 'Porch'),
        (r'reception', 'reception', 'Reception'),
        (r'pharmacy', 'pharmacy', 'Pharmacy'),
        (r'cafeteria', 'cafeteria', 'Cafeteria'),
        (r'store', 'store', 'Store'),
        (r'lab(?:oratory)?', 'lab', 'Laboratory'),
        (r'lift', 'lift', 'Lift'),
        (r'icu', 'icu_room', 'ICU'),
        (r'fhc', 'fhc', 'FHC'),
        (r'ward', 'ward', 'Ward'),
        (r'hall', 'living_room', 'Hall'),
    ]

    found_rooms = set()
    for pattern, room_type, label in room_patterns:
        count_match = re.search(rf'(\d+)\s*{pattern}s?', text)
        simple_match = re.search(pattern, text)

        if count_match:
            count = int(count_match.group(1))
            key = f"{room_type}_{count_match.start()}"
            if key not in found_rooms:
                found_rooms.add(key)
                rooms.append(RoomSpec(name=label, type=room_type, count=count))
        elif simple_match:
            key = f"{room_type}_{simple_match.start()}"
            if key not in found_rooms:
                found_rooms.add(key)
                rooms.append(RoomSpec(name=label, type=room_type, count=1))

    return rooms


def _default_rooms(building_type: str) -> List[RoomSpec]:
    """Return default room list for a building type."""
    defaults = {
        "residential": [
            RoomSpec(name="Living Room", type="living_room"),
            RoomSpec(name="Kitchen", type="kitchen"),
            RoomSpec(name="Bedroom", type="bedroom", count=2),
            RoomSpec(name="Bathroom", type="bathroom"),
            RoomSpec(name="Toilet", type="toilet"),
        ],
        "hospital": [
            RoomSpec(name="Reception", type="reception"),
            RoomSpec(name="Waiting Area", type="waiting_area"),
            RoomSpec(name="Private Room", type="private_room", count=4),
            RoomSpec(name="Toilet", type="toilet", count=3),
            RoomSpec(name="Nurse Station", type="nurse_station"),
            RoomSpec(name="Corridor", type="corridor"),
        ],
        "office": [
            RoomSpec(name="Reception", type="reception"),
            RoomSpec(name="Office", type="office", count=4),
            RoomSpec(name="Conference Room", type="conference_room"),
            RoomSpec(name="Bathroom", type="bathroom", count=2),
            RoomSpec(name="Kitchen", type="kitchen"),
            RoomSpec(name="Corridor", type="corridor"),
        ],
        "commercial": [
            RoomSpec(name="Store", type="store", count=3),
            RoomSpec(name="Office", type="office"),
            RoomSpec(name="Bathroom", type="bathroom"),
            RoomSpec(name="Store Room", type="store"),
        ],
    }
    return defaults.get(building_type, defaults["residential"])


# ── Layout Generation Engine ──

class LayoutGenerator:
    """
    Rule-based floor plan layout generator.
    Places rooms in a grid/strip arrangement within the plot bounds.
    Creates walls, doors, windows automatically.
    """

    def __init__(
        self,
        plot_width: float,
        plot_length: float,
        wall_height: float = 3.0,
        wall_thickness: float = 0.15,
        ext_wall_thickness: float = 0.25,
    ):
        self.plot_width = plot_width
        self.plot_length = plot_length
        self.wall_height = wall_height
        self.wall_thickness = wall_thickness
        self.ext_wall_thickness = ext_wall_thickness

    def generate_floor(self, floor_spec: FloorSpec) -> dict:
        """Generate a single floor layout from room specifications."""
        rooms_to_place = []

        for room_spec in floor_spec.rooms:
            for i in range(room_spec.count):
                defaults = ROOM_DEFAULTS.get(room_spec.type, ROOM_DEFAULTS["unknown"])
                w = room_spec.width_m or defaults["width"]
                l = room_spec.length_m or defaults["length"]

                if room_spec.area_sqm:
                    current_area = w * l
                    scale = math.sqrt(room_spec.area_sqm / current_area)
                    w *= scale
                    l *= scale

                label = room_spec.name
                if room_spec.count > 1:
                    label = f"{room_spec.name} {i + 1}"

                rooms_to_place.append({
                    "label": label,
                    "type": room_spec.type,
                    "width": w,
                    "length": l,
                    "area": w * l,
                })

        corridor_rooms = [r for r in rooms_to_place if r["type"] in ("corridor", "hallway")]
        other_rooms = [r for r in rooms_to_place if r["type"] not in ("corridor", "hallway")]
        other_rooms.sort(key=lambda r: r["area"], reverse=True)

        placed_rooms = self._place_rooms_two_strip(corridor_rooms + other_rooms)
        walls = self._generate_walls(placed_rooms)
        doors = self._generate_doors(placed_rooms)
        windows = self._generate_windows(placed_rooms)

        return {
            "id": f"floor-{floor_spec.level}",
            "level": floor_spec.level,
            "label": floor_spec.label,
            "elevation_m": floor_spec.level * self.wall_height,
            "height_m": floor_spec.height_m or self.wall_height,
            "walls": walls,
            "rooms": placed_rooms,
            "doors": doors,
            "windows": windows,
        }

    def _place_rooms_two_strip(self, rooms: List[dict]) -> List[dict]:
        """Place rooms in a two-strip arrangement with optional central corridor."""
        placed = []
        corridor_width = 1.8

        has_corridor = any(r["type"] in ("corridor", "hallway") for r in rooms)
        non_corridor_rooms = [r for r in rooms if r["type"] not in ("corridor", "hallway")]

        if not non_corridor_rooms:
            y = 0
            for room in rooms:
                room_data = self._make_room(room, 0, y, self.plot_width, room["length"])
                placed.append(room_data)
                y += room["length"]
            return placed

        usable_width = self.plot_width

        if has_corridor:
            top_strip_height = (self.plot_length - corridor_width) / 2
            bottom_strip_height = (self.plot_length - corridor_width) / 2
            corridor_y = top_strip_height
        else:
            corridor_width = 0
            top_strip_height = self.plot_length / 2
            bottom_strip_height = self.plot_length / 2
            corridor_y = top_strip_height

        top_rooms, bottom_rooms = self._split_rooms_equal(non_corridor_rooms)

        # Place top strip
        x_cursor = 0
        for room in top_rooms:
            room_width = min(room["width"], usable_width - x_cursor)
            if room_width < 1.5:
                room_width = usable_width - x_cursor
            if x_cursor + room_width > usable_width:
                room_width = usable_width - x_cursor
            room_data = self._make_room(room, x_cursor, 0, room_width, top_strip_height)
            placed.append(room_data)
            x_cursor += room_width

        if x_cursor < usable_width - 0.5 and top_rooms and placed:
            last = placed[-1]
            verts = last["polygon"]["vertices"]
            for v in verts:
                if v["x"] == x_cursor:
                    v["x"] = usable_width
            last["area_sqm"] = self._poly_area(last["polygon"]["vertices"])

        # Place corridor
        if has_corridor:
            corridor_data = self._make_room(
                {"label": "Corridor", "type": "corridor",
                 "width": usable_width, "length": corridor_width,
                 "area": usable_width * corridor_width},
                0, corridor_y, usable_width, corridor_width
            )
            placed.append(corridor_data)

        # Place bottom strip
        bottom_y = corridor_y + corridor_width
        x_cursor = 0
        for room in bottom_rooms:
            room_width = min(room["width"], usable_width - x_cursor)
            if room_width < 1.5:
                room_width = usable_width - x_cursor
            if x_cursor + room_width > usable_width:
                room_width = usable_width - x_cursor
            room_data = self._make_room(room, x_cursor, bottom_y, room_width, bottom_strip_height)
            placed.append(room_data)
            x_cursor += room_width

        if x_cursor < usable_width - 0.5 and bottom_rooms and placed:
            last = placed[-1]
            verts = last["polygon"]["vertices"]
            for v in verts:
                if abs(v["x"] - x_cursor) < 0.01:
                    v["x"] = usable_width
            last["area_sqm"] = self._poly_area(last["polygon"]["vertices"])

        return placed

    def _split_rooms_equal(self, rooms: List[dict]) -> Tuple[List[dict], List[dict]]:
        """Split rooms into two groups with roughly equal total area."""
        total_area = sum(r["area"] for r in rooms)
        target = total_area / 2

        top = []
        bottom = []
        top_area = 0

        for room in rooms:
            if top_area < target:
                top.append(room)
                top_area += room["area"]
            else:
                bottom.append(room)

        if not bottom and len(top) > 1:
            bottom.append(top.pop())
        if not top and len(bottom) > 1:
            top.append(bottom.pop(0))

        return top, bottom

    def _make_room(self, room: dict, x: float, y: float, w: float, h: float) -> dict:
        """Create a room data object with polygon, area, etc."""
        vertices = [
            {"x": round(x, 4), "y": round(y, 4)},
            {"x": round(x + w, 4), "y": round(y, 4)},
            {"x": round(x + w, 4), "y": round(y + h, 4)},
            {"x": round(x, 4), "y": round(y + h, 4)},
        ]
        area = w * h
        cx = x + w / 2
        cy = y + h / 2

        return {
            "id": f"room-{uuid.uuid4().hex[:8]}",
            "polygon": {"vertices": vertices},
            "area_sqm": round(area, 2),
            "type": room["type"],
            "label": room["label"],
            "confidence": 1.0,
            "centroid": {"x": round(cx, 4), "y": round(cy, 4)},
            "width_m": round(w, 2),
            "height_m": round(h, 2),
        }

    def _poly_area(self, vertices: List[dict]) -> float:
        """Calculate polygon area using the shoelace formula."""
        n = len(vertices)
        area = 0
        for i in range(n):
            j = (i + 1) % n
            area += vertices[i]["x"] * vertices[j]["y"]
            area -= vertices[j]["x"] * vertices[i]["y"]
        return round(abs(area) / 2, 2)

    def _generate_walls(self, rooms: List[dict]) -> List[dict]:
        """Generate wall segments from placed rooms."""
        walls = []
        wall_set = set()

        for room in rooms:
            vertices = room["polygon"]["vertices"]
            n = len(vertices)

            for i in range(n):
                j = (i + 1) % n
                v1 = vertices[i]
                v2 = vertices[j]

                key = self._wall_key(v1["x"], v1["y"], v2["x"], v2["y"])
                if key in wall_set:
                    continue
                wall_set.add(key)

                is_exterior = self._is_exterior_edge(v1, v2)

                walls.append({
                    "id": f"w-{uuid.uuid4().hex[:8]}",
                    "start": {"x": v1["x"], "y": v1["y"]},
                    "end": {"x": v2["x"], "y": v2["y"]},
                    "thickness_m": self.ext_wall_thickness if is_exterior else self.wall_thickness,
                    "type": "exterior" if is_exterior else "interior",
                    "confidence": 1.0,
                })

        return walls

    def _wall_key(self, x1, y1, x2, y2):
        """Create a canonical key for a wall segment."""
        p1 = (round(x1, 2), round(y1, 2))
        p2 = (round(x2, 2), round(y2, 2))
        return (min(p1, p2), max(p1, p2))

    def _is_exterior_edge(self, v1: dict, v2: dict) -> bool:
        """Check if an edge is on the plot boundary."""
        eps = 0.1
        if abs(v1["y"]) < eps and abs(v2["y"]) < eps:
            return True
        if abs(v1["y"] - self.plot_length) < eps and abs(v2["y"] - self.plot_length) < eps:
            return True
        if abs(v1["x"]) < eps and abs(v2["x"]) < eps:
            return True
        if abs(v1["x"] - self.plot_width) < eps and abs(v2["x"] - self.plot_width) < eps:
            return True
        return False

    def _is_perimeter(self, room: dict) -> bool:
        """Check if room has any edge on the plot boundary."""
        for v in room["polygon"]["vertices"]:
            if (abs(v["x"]) < 0.1 or abs(v["x"] - self.plot_width) < 0.1 or
                abs(v["y"]) < 0.1 or abs(v["y"] - self.plot_length) < 0.1):
                return True
        return False

    def _generate_doors(self, rooms: List[dict]) -> List[dict]:
        """Generate doors for each room."""
        doors = []

        for room in rooms:
            if room["type"] in ("corridor", "hallway"):
                continue

            verts = room["polygon"]["vertices"]
            if len(verts) < 4:
                continue

            best_edge = None
            best_score = -1

            for i in range(len(verts)):
                j = (i + 1) % len(verts)
                v1, v2 = verts[i], verts[j]

                is_ext = self._is_exterior_edge(v1, v2)
                edge_len = math.sqrt((v2["x"] - v1["x"]) ** 2 + (v2["y"] - v1["y"]) ** 2)

                score = 0
                if not is_ext:
                    score += 10
                if edge_len > 1.5:
                    score += 5
                if abs(v1["y"] - v2["y"]) < 0.01:
                    score += 3

                if score > best_score:
                    best_score = score
                    best_edge = (v1, v2)

            if best_edge:
                v1, v2 = best_edge
                mid_x = (v1["x"] + v2["x"]) / 2
                mid_y = (v1["y"] + v2["y"]) / 2

                door_width = 0.9
                if room["type"] in ("operation_theater", "icu_room", "ward", "general_ward"):
                    door_width = 1.2

                doors.append({
                    "id": f"door-{uuid.uuid4().hex[:8]}",
                    "position": {"x": round(mid_x, 4), "y": round(mid_y, 4)},
                    "width_m": door_width,
                    "height_m": 2.1,
                    "type": "double" if door_width > 1.0 else "single",
                    "confidence": 1.0,
                })

        return doors

    def _generate_windows(self, rooms: List[dict]) -> List[dict]:
        """Generate windows for rooms with exterior edges."""
        windows = []

        for room in rooms:
            if room["type"] in ("corridor", "hallway", "closet", "toilet", "lift", "staircase", "fhc"):
                continue

            verts = room["polygon"]["vertices"]

            for i in range(len(verts)):
                j = (i + 1) % len(verts)
                v1, v2 = verts[i], verts[j]

                if self._is_exterior_edge(v1, v2):
                    edge_len = math.sqrt((v2["x"] - v1["x"]) ** 2 + (v2["y"] - v1["y"]) ** 2)
                    if edge_len < 2.0:
                        continue

                    mid_x = (v1["x"] + v2["x"]) / 2
                    mid_y = (v1["y"] + v2["y"]) / 2
                    win_width = min(1.5, edge_len * 0.5)

                    windows.append({
                        "id": f"win-{uuid.uuid4().hex[:8]}",
                        "position": {"x": round(mid_x, 4), "y": round(mid_y, 4)},
                        "width_m": round(win_width, 2),
                        "height_m": 1.2,
                        "sill_height_m": 0.9,
                        "type": "casement",
                        "confidence": 1.0,
                    })

        return windows
