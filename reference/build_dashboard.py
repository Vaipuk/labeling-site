"""Build the relevance labelling dashboard: one self-contained HTML file.

    python -m labeling.build_dashboard

Reads the pipeline and parser artifacts, writes labeling/notam_labeling.html.
Everything the reviewer needs is embedded in that file, so it opens by double
clicking with no install, no server and no internet.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd

from datapipeline import config as C

HERE = Path(__file__).resolve().parent
OUT_HTML = HERE / "notam_labeling.html"
TRAINING_PAIRS = C.OUTPUT / "training_pairs.csv"
TRAJECTORIES = C.INTERMEDIATE / "flight_trajectories.parquet"
PARSED = HERE.parent / "parser" / "output" / "parsed_notams.parquet"

# Enough shape to recognise the track, small enough to embed 396 of them.
TRACK_POINTS = 70

PHASE_WORDS = {
    "taxi_out": "taxiing out",
    "taxi_in": "taxiing in",
    "takeoff": "taking off",
    "climb": "climbing",
    "cruise": "in cruise",
    "descent": "descending",
    "approach": "on approach",
}

ACTIVITY_WORDS = {
    "uas": "Drone flying",
    "parachute": "Parachute jumping",
    "balloon": "Balloon flying",
    "laser": "Laser activity",
    "airshow": "An air show",
    "fireworks": "Fireworks",
    "military": "Military activity",
    "aerobatics": "Aerobatics",
    "airdrop": "An airdrop",
    "rocket": "A rocket launch",
    "survey": "Survey flying",
    "firefighting": "Firefighting aircraft",
    "service_outage": "A service outage",
    "obstruction": "An obstruction",
    "hazard": "A hazard",
    "security": "A security restriction",
    "traffic": "Traffic activity",
    "light_aviation": "Light aircraft activity",
    "procedure_change": "A procedure change",
    "gps_outage": "A GPS outage",
}


def nm_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great circle distance in nautical miles."""
    radians = math.radians
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(radians(lat1)) * math.cos(radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 3440.065 * 2 * math.asin(math.sqrt(a))


def thin(points: list, keep: int) -> list:
    """Keep roughly `keep` evenly spaced points, always including the ends."""
    if len(points) <= keep:
        return points
    step = len(points) / keep
    picked = [points[int(i * step)] for i in range(keep)]
    picked.append(points[-1])
    return picked


def feet(value) -> str:
    if pd.isna(value):
        return ""
    return f"{int(round(value)):,} ft"


def describe_notice(row: pd.Series) -> str:
    """Turn the parsed fields into a sentence a pilot would read."""
    what = ACTIVITY_WORDS.get(row.get("activity"), None)
    if what is None:
        what = "Activity" if row.get("family") != "sua_activation" else "Military airspace in use"

    where = ""
    if pd.notna(row.get("radius_nm")):
        # Nautical miles. Spelling it out avoids any chance of a statute reading.
        where = f" inside a circle {row['radius_nm']:g} nm in radius"
    elif row.get("geometry_status") == "resolved_polygon":
        where = " inside a marked area"
    if pd.notna(row.get("area_name")):
        where += f" ({row['area_name']})"

    low, high = row.get("alt_lower_ft"), row.get("alt_upper_ft")
    height = ""
    if pd.notna(low) and pd.notna(high):
        floor = "the ground" if low == 0 else feet(low)
        height = f", from {floor} up to {feet(high)}"
    elif pd.notna(high):
        height = f", up to {feet(high)}"

    if not where and pd.notna(row.get("facility_code")):
        where = f" at {row['facility_code']}"
    return f"{what}{where}{height}."


def build_notices(pairs: pd.DataFrame) -> dict:
    """Keyed on (notam_id, source).

    The two corpora reuse notam_id on 30,099 values, and they are different
    notices. Id 19482 is a 2 nm drone circle in Texas in the domestic file and a
    300 nm GPS interference area over Arizona in the ICAO file. Keying on the id
    alone silently swaps one for the other.
    """
    parsed = pd.read_parquet(PARSED)
    wanted = set(zip(pairs["notam_id"], pairs["notam_source"]))
    parsed = parsed[[(i, s) in wanted for i, s in zip(parsed["notam_id"], parsed["source"])]]
    # A pointer notice only says "see that other notice", so there is nothing to
    # judge. Leave them out rather than make her skip them one by one.
    parsed = parsed[parsed["family"] != "pointer"]
    texts = pd.concat([
        pd.read_parquet(C.CLEAN_NOTAM_USA_PARQUET, columns=["notam_id", "text"]).assign(source="USA"),
        pd.read_parquet(C.CLEAN_NOTAM_GPS_PARQUET, columns=["notam_id", "text"]).assign(source="GPS"),
    ], ignore_index=True)
    parsed = parsed.merge(texts, on=["notam_id", "source"], how="left")

    notices = {}
    for row in parsed.itertuples(index=False):
        series = pd.Series(row._asdict())
        shape = None
        if series.get("geometry_status") == "resolved_polygon" and isinstance(series.get("polygon_points"), str):
            shape = {
                "kind": "polygon",
                "points": [
                    [float(p.split(",")[0]), float(p.split(",")[1])]
                    for p in series["polygon_points"].split(";")
                ],
            }
        elif pd.notna(series.get("center_lat")) and pd.notna(series.get("radius_nm")):
            shape = {
                "kind": "circle",
                "center": [float(series["center_lat"]), float(series["center_lon"])],
                "radius_nm": float(series["radius_nm"]),
            }
        elif pd.notna(series.get("center_lat")):
            # No area was published, only a place. Saying "a circle" would be
            # inventing a boundary the notice never set.
            shape = {"kind": "point", "center": [float(series["center_lat"]), float(series["center_lon"])]}
        notices[(int(series["notam_id"]), series["source"])] = {
            "plain": describe_notice(series),
            "raw": (series.get("text") or "").strip(),
            "category": series.get("family"),
            "shape": shape,
        }
    return notices


def build_tracks(flight_ids: set) -> dict:
    trajectories = pd.read_parquet(TRAJECTORIES)
    trajectories = trajectories[trajectories["flight_id"].isin(flight_ids)]
    tracks = {}
    for flight_id, frame in trajectories.groupby("flight_id"):
        frame = frame.dropna(subset=["lat", "lon"])
        points = list(zip(frame["lat"], frame["lon"], frame["alt_ft"], frame["phase"]))
        kept = thin(points, TRACK_POINTS)
        tracks[flight_id] = {
            "path": [[round(p[0], 4), round(p[1], 4)] for p in kept],
            "full": points,
        }
    return tracks


def inside_polygon(lat: float, lon: float, points: list) -> bool:
    """Ray casting. Good enough at these distances, and it only decides a label."""
    inside = False
    count = len(points)
    for i in range(count):
        y1, x1 = points[i]
        y2, x2 = points[(i + 1) % count]
        if (y1 > lat) != (y2 > lat):
            crossing = x1 + (lat - y1) / (y2 - y1) * (x2 - x1)
            if lon < crossing:
                inside = not inside
    return inside


def distance_to_edge(lat: float, lon: float, shape: dict) -> tuple[float, bool]:
    """Nautical miles to the boundary, and whether the point is inside it.

    Distance to the centre is the wrong number to show: a flight skimming the
    rim of a 136 nm circle is 136 nm from its centre and nowhere near outside.
    """
    if shape["kind"] == "point":
        return nm_between(lat, lon, shape["center"][0], shape["center"][1]), False
    if shape["kind"] == "circle":
        gap = nm_between(lat, lon, shape["center"][0], shape["center"][1]) - shape["radius_nm"]
        return abs(gap), gap <= 0
    nearest = min(nm_between(lat, lon, p[0], p[1]) for p in shape["points"])
    return nearest, inside_polygon(lat, lon, shape["points"])


def closest_moment(track_points: list, shape: dict | None) -> dict:
    """Where on the flight did it come nearest, and what was it doing then."""
    if shape is None or not track_points:
        return {}
    measured = [(distance_to_edge(p[0], p[1], shape), p) for p in track_points]
    # An inside point always beats an outside one, then nearest wins.
    (gap, inside), best = min(measured, key=lambda m: (not m[0][1], m[0][0]))
    return {
        "phase": PHASE_WORDS.get(best[3], best[3]),
        "alt_ft": None if pd.isna(best[2]) else int(round(best[2])),
        "nm": round(gap, 1),
        "inside": bool(inside),
    }


def main() -> None:
    pairs = pd.read_csv(TRAINING_PAIRS, low_memory=False)
    notices = build_notices(pairs)
    # Pointer notices carry no content of their own, so grading one tells us
    # nothing. They are excluded rather than shown and skipped.
    keys = set(notices)
    pairs = pairs[[(i, s) in keys for i, s in zip(pairs["notam_id"], pairs["notam_source"])]]
    tracks = build_tracks(set(pairs["flight_id"]))

    items = []
    for row in pairs.itertuples(index=False):
        notice = notices[(int(row.notam_id), row.notam_source)]
        track = tracks.get(row.flight_id)
        if track is None:
            continue
        moment = closest_moment(track["full"], notice["shape"])
        items.append({
            "id": f"{row.flight_id}__{row.notam_source}_{row.notam_id}",
            "flight": row.flight_id,
            "airport": row.airport_tag,
            "date": str(row.flight_start_utc)[:10],
            "duration_min": round(float(row.duration_min)),
            "path": track["path"],
            "notice": notice["plain"],
            "raw": notice["raw"],
            "category": notice["category"],
            "shape": notice["shape"],
            "moment": moment,
            "overlap_min": round(float(row.time_overlap_sec) / 60),
        })

    # Same notice seen by many flights is the boring case; lead with variety so
    # the reviewer meets every distinct notice early and can stop any time.
    items.sort(key=lambda item: (item["notice"], item["flight"]))
    seen: dict[str, int] = {}
    for item in items:
        seen[item["notice"]] = seen.get(item["notice"], 0) + 1
        item["rank"] = seen[item["notice"]]
    items.sort(key=lambda item: (item["rank"], item["notice"]))

    template = (HERE / "template.html").read_text(encoding="utf-8")
    html = template.replace("__DATA__", json.dumps(items, separators=(",", ":")))
    OUT_HTML.write_text(html, encoding="utf-8")

    size_mb = OUT_HTML.stat().st_size / 1_000_000
    print(f"[dashboard] {len(items)} pairs, {len(notices)} distinct notices, "
          f"{len(set(i['flight'] for i in items))} flights")
    print(f"[dashboard] wrote {OUT_HTML} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
