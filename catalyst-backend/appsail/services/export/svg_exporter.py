"""
SVG Floor Plan Exporter

Generates a clean SVG representation of the 2D floor plan
from the Unified Spatial Model.
Identical logic to the original backend — no Catalyst dependency.
"""

from typing import Dict, List
import xml.etree.ElementTree as ET


def generate_svg(spatial_model: dict, width: int = 800, height: int = 600) -> str:
    """
    Generate an SVG floor plan from the spatial model.

    Features:
    - Walls as thick lines
    - Rooms with fill colors and labels
    - Doors as arcs
    - Windows as dashed patterns
    - Scale bar
    """
    bbox = spatial_model.get("metadata", {}).get("bounding_box", {})
    min_pt = bbox.get("min", {"x": 0, "y": 0})
    max_pt = bbox.get("max", {"x": 10, "y": 10})

    model_width = max_pt["x"] - min_pt["x"]
    model_height = max_pt["y"] - min_pt["y"]

    if model_width == 0 or model_height == 0:
        model_width = model_height = 10

    padding = max(model_width, model_height) * 0.1
    vb_x = min_pt["x"] - padding
    vb_y = min_pt["y"] - padding
    vb_w = model_width + 2 * padding
    vb_h = model_height + 2 * padding

    svg = ET.Element("svg", {
        "xmlns": "http://www.w3.org/2000/svg",
        "width": str(width),
        "height": str(height),
        "viewBox": f"{vb_x} {vb_y} {vb_w} {vb_h}",
    })

    defs = ET.SubElement(svg, "defs")
    style = ET.SubElement(defs, "style")
    style.text = """
        .wall { stroke: #333; stroke-linecap: round; fill: none; }
        .wall-exterior { stroke-width: 0.3; }
        .wall-interior { stroke-width: 0.15; }
        .room-fill { fill-opacity: 0.3; stroke: none; }
        .room-label { font-family: Arial, sans-serif; font-size: 0.4px; 
                       fill: #555; text-anchor: middle; dominant-baseline: middle; }
        .door { stroke: #666; stroke-width: 0.05; fill: none; }
        .window { stroke: #4a9eff; stroke-width: 0.1; fill: none; 
                   stroke-dasharray: 0.1,0.05; }
        .dimension { stroke: #999; stroke-width: 0.02; fill: none; }
        .dim-text { font-family: Arial, sans-serif; font-size: 0.25px; 
                     fill: #999; text-anchor: middle; }
    """

    room_colors = {
        "living_room": "#FFF8DC",
        "bedroom": "#E6E6FA",
        "kitchen": "#FFE4C4",
        "bathroom": "#B0E0E6",
        "toilet": "#B0E0E6",
        "hallway": "#F5F5DC",
        "closet": "#D2B48C",
        "office": "#F0FFF0",
        "dining_room": "#FFEFD5",
        "unknown": "#E6E6E6",
    }

    for floor_data in spatial_model.get("floors", []):
        # Room fills
        for room in floor_data.get("rooms", []):
            vertices = room.get("polygon", {}).get("vertices", [])
            if len(vertices) >= 3:
                points = " ".join(f"{v['x']},{v['y']}" for v in vertices)
                room_type = room.get("type", "unknown")
                color = room_colors.get(room_type, room_colors["unknown"])

                ET.SubElement(svg, "polygon", {
                    "points": points,
                    "class": "room-fill",
                    "fill": color,
                })

                centroid_x = sum(v["x"] for v in vertices) / len(vertices)
                centroid_y = sum(v["y"] for v in vertices) / len(vertices)

                label = room.get("label", "")
                area = room.get("area_sqm", 0)

                text_el = ET.SubElement(svg, "text", {
                    "x": str(centroid_x),
                    "y": str(centroid_y),
                    "class": "room-label",
                })
                text_el.text = label

                if area:
                    area_text = ET.SubElement(svg, "text", {
                        "x": str(centroid_x),
                        "y": str(centroid_y + 0.5),
                        "class": "room-label",
                        "font-size": "0.3px",
                    })
                    area_text.text = f"{area:.1f} m²"

        # Walls
        for wall in floor_data.get("walls", []):
            start = wall.get("start", {})
            end = wall.get("end", {})
            wall_type = wall.get("type", "interior")
            css_class = f"wall wall-{'exterior' if wall_type == 'exterior' else 'interior'}"

            ET.SubElement(svg, "line", {
                "x1": str(start.get("x", 0)),
                "y1": str(start.get("y", 0)),
                "x2": str(end.get("x", 0)),
                "y2": str(end.get("y", 0)),
                "class": css_class,
            })

        # Doors
        for door in floor_data.get("doors", []):
            pos = door.get("position", {})
            w = door.get("width_m", 0.9)
            x = pos.get("x", 0)
            y = pos.get("y", 0)

            ET.SubElement(svg, "path", {
                "d": f"M {x-w/2},{y} A {w},{w} 0 0 1 {x+w/2},{y}",
                "class": "door",
            })

        # Windows
        for window in floor_data.get("windows", []):
            pos = window.get("position", {})
            w = window.get("width_m", 1.2)
            x = pos.get("x", 0)
            y = pos.get("y", 0)

            ET.SubElement(svg, "line", {
                "x1": str(x - w / 2),
                "y1": str(y),
                "x2": str(x + w / 2),
                "y2": str(y),
                "class": "window",
            })

    # Scale bar
    scale_bar_x = vb_x + padding
    scale_bar_y = vb_y + vb_h - padding / 2
    scale_length = round(model_width / 5, 1)

    ET.SubElement(svg, "line", {
        "x1": str(scale_bar_x),
        "y1": str(scale_bar_y),
        "x2": str(scale_bar_x + scale_length),
        "y2": str(scale_bar_y),
        "class": "dimension",
        "stroke-width": "0.05",
    })
    scale_text = ET.SubElement(svg, "text", {
        "x": str(scale_bar_x + scale_length / 2),
        "y": str(scale_bar_y - 0.3),
        "class": "dim-text",
    })
    scale_text.text = f"{scale_length} m"

    return ET.tostring(svg, encoding="unicode", xml_declaration=True)
