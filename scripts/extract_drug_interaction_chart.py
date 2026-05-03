#!/usr/bin/env python3
"""Extract a color-coded drug interaction matrix from chart PNG render."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from PIL import Image
import numpy as np


@dataclass(frozen=True)
class LegendEntry:
    code: str
    label: str
    rgb: Tuple[int, int, int]
    hex: str
    symbol: str
    description: str


DRUGS: List[str] = [
    "LSD",
    "Mushrooms",
    "DMT",
    "Mescaline",
    "DOx",
    "NBOMes",
    "2C-x",
    "2C-T-x",
    "5-MeO-xT",
    "Cannabis",
    "Ketamine",
    "MXE",
    "DXM",
    "Nitrous",
    "Amphetamines",
    "MDMA",
    "Cocaine",
    "Caffeine",
    "Alcohol",
    "GHB/GBL",
    "Opioids",
    "Tramadol",
    "Benzodiazepines",
    "MAOIs",
    "SSRIs",
]

DRUG_CLASSES: Dict[str, str] = {
    "LSD": "Psychedelic",
    "Mushrooms": "Psychedelic",
    "DMT": "Psychedelic",
    "Mescaline": "Psychedelic",
    "DOx": "Psychedelic",
    "NBOMes": "Psychedelic",
    "2C-x": "Psychedelic",
    "2C-T-x": "Psychedelic",
    "5-MeO-xT": "Psychedelic",
    "Cannabis": "Cannabinoid",
    "Ketamine": "Dissociative",
    "MXE": "Dissociative",
    "DXM": "Dissociative",
    "Nitrous": "Dissociative",
    "Amphetamines": "Stimulant",
    "MDMA": "Stimulant/Entactogen",
    "Cocaine": "Stimulant",
    "Caffeine": "Stimulant",
    "Alcohol": "Depressant",
    "GHB/GBL": "Depressant",
    "Opioids": "Depressant",
    "Tramadol": "Depressant",
    "Benzodiazepines": "Depressant",
    "MAOIs": "Antidepressant",
    "SSRIs": "Antidepressant",
}

LEGEND: Sequence[LegendEntry] = (
    LegendEntry(
        code="LRS",
        label="Low Risk & Synergy",
        rgb=(28, 138, 209),
        hex="#1C8AD1",
        symbol="UP",
        description="Generally low-risk combination with potential synergistic effects.",
    ),
    LegendEntry(
        code="LRN",
        label="Low Risk & No Synergy",
        rgb=(62, 165, 230),
        hex="#3EA5E6",
        symbol="CIRCLE",
        description="Generally low-risk combination without notable synergy.",
    ),
    LegendEntry(
        code="LRD",
        label="Low Risk & Decrease",
        rgb=(16, 109, 174),
        hex="#106DAE",
        symbol="DOWN",
        description="Generally low-risk combination where one effect may reduce another.",
    ),
    LegendEntry(
        code="CAU",
        label="Caution",
        rgb=(215, 202, 37),
        hex="#D7CA25",
        symbol="WARN",
        description="Use caution; increased side-effect or unpredictability risk.",
    ),
    LegendEntry(
        code="UNS",
        label="Unsafe",
        rgb=(221, 139, 40),
        hex="#DD8B28",
        symbol="HEART",
        description="Unsafe combination with substantial risk.",
    ),
    LegendEntry(
        code="DAN",
        label="Dangerous",
        rgb=(226, 27, 43),
        hex="#E21B2B",
        symbol="X",
        description="Dangerous combination; avoid.",
    ),
)

SELF_ENTRY = LegendEntry(
    code="SELF",
    label="Same Drug / N-A",
    rgb=(39, 79, 19),
    hex="#274F13",
    symbol="SELF",
    description="Diagonal label cell for the same substance; not an interaction rating.",
)


def contiguous_ranges(indices: np.ndarray) -> List[Tuple[int, int]]:
    ranges: List[Tuple[int, int]] = []
    if len(indices) == 0:
        return ranges
    start = int(indices[0])
    prev = int(indices[0])
    for idx in indices[1:]:
        i = int(idx)
        if i == prev + 1:
            prev = i
            continue
        ranges.append((start, prev))
        start = prev = i
    ranges.append((start, prev))
    return ranges


def detect_grid_ranges(img: np.ndarray) -> Tuple[List[Tuple[int, int]], List[Tuple[int, int]]]:
    near_black = np.all(img < 30, axis=2)
    col_nonblack = np.where(near_black.mean(axis=0) < 0.9)[0]
    row_nonblack = np.where(near_black.mean(axis=1) < 0.9)[0]
    col_ranges = contiguous_ranges(col_nonblack)
    row_ranges = contiguous_ranges(row_nonblack)
    # Filter tiny artifacts; keep label + matrix + label columns/rows.
    col_ranges = [r for r in col_ranges if (r[1] - r[0] + 1) > 40]
    row_ranges = [r for r in row_ranges if (r[1] - r[0] + 1) > 40]
    return col_ranges, row_ranges


def sample_cell_color(img: np.ndarray, x0: int, x1: int, y0: int, y1: int) -> Tuple[int, int, int]:
    cell = img[y0:y1, x0:x1]
    h, w = cell.shape[:2]
    # Corner samples avoid center icons/text.
    pad = max(6, min(h, w) // 12)
    patch = max(10, min(h, w) // 6)
    points = [
        cell[pad : pad + patch, pad : pad + patch],
        cell[pad : pad + patch, w - pad - patch : w - pad],
        cell[h - pad - patch : h - pad, pad : pad + patch],
        cell[h - pad - patch : h - pad, w - pad - patch : w - pad],
    ]
    samples = np.concatenate([p.reshape(-1, 3) for p in points], axis=0)
    rgb = np.median(samples, axis=0)
    return int(rgb[0]), int(rgb[1]), int(rgb[2])


def nearest_legend(rgb: Tuple[int, int, int]) -> LegendEntry:
    arr = np.array(rgb)
    best = min(LEGEND, key=lambda e: np.linalg.norm(arr - np.array(e.rgb)))
    return best


def write_csv(path: Path, rows: List[dict], fieldnames: Sequence[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=True)
        f.write("\n")


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_sql_seed(
    path: Path, legend_rows: List[dict], drug_rows: List[dict], interaction_rows: List[dict]
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines: List[str] = []
    lines.append("-- Drug interaction chart seed data")
    lines.append("-- Generated by scripts/extract_drug_interaction_chart.py")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")
    lines.append("CREATE TABLE IF NOT EXISTS interaction_legend (")
    lines.append("  interaction_code TEXT PRIMARY KEY,")
    lines.append("  interaction_label TEXT NOT NULL,")
    lines.append("  interaction_symbol TEXT NOT NULL,")
    lines.append("  canonical_hex TEXT NOT NULL,")
    lines.append("  canonical_rgb TEXT NOT NULL,")
    lines.append("  description TEXT NOT NULL,")
    lines.append("  source TEXT NOT NULL")
    lines.append(");")
    lines.append("")
    lines.append("CREATE TABLE IF NOT EXISTS drugs (")
    lines.append("  drug TEXT PRIMARY KEY,")
    lines.append("  drug_class TEXT NOT NULL,")
    lines.append("  display_name TEXT NOT NULL,")
    lines.append("  active BOOLEAN NOT NULL")
    lines.append(");")
    lines.append("")
    lines.append("CREATE TABLE IF NOT EXISTS drug_interactions (")
    lines.append("  row_drug TEXT NOT NULL REFERENCES drugs(drug),")
    lines.append("  col_drug TEXT NOT NULL REFERENCES drugs(drug),")
    lines.append("  interaction_code TEXT NOT NULL REFERENCES interaction_legend(interaction_code),")
    lines.append("  sampled_rgb TEXT NOT NULL,")
    lines.append("  distance_to_canonical_rgb REAL NOT NULL,")
    lines.append("  source TEXT NOT NULL,")
    lines.append("  PRIMARY KEY (row_drug, col_drug)")
    lines.append(");")
    lines.append("")
    lines.append("DELETE FROM drug_interactions;")
    lines.append("DELETE FROM drugs;")
    lines.append("DELETE FROM interaction_legend;")
    lines.append("")

    lines.append("INSERT INTO interaction_legend (interaction_code, interaction_label, interaction_symbol, canonical_hex, canonical_rgb, description, source) VALUES")
    for i, row in enumerate(legend_rows):
        suffix = "," if i < len(legend_rows) - 1 else ";"
        lines.append(
            "  ("
            + ", ".join(
                [
                    sql_quote(row["interaction_code"]),
                    sql_quote(row["interaction_label"]),
                    sql_quote(row["interaction_symbol"]),
                    sql_quote(row["canonical_hex"]),
                    sql_quote(row["canonical_rgb"]),
                    sql_quote(row["description"]),
                    sql_quote(row["source"]),
                ]
            )
            + f"){suffix}"
        )
    lines.append("")

    lines.append("INSERT INTO drugs (drug, drug_class, display_name, active) VALUES")
    for i, row in enumerate(drug_rows):
        suffix = "," if i < len(drug_rows) - 1 else ";"
        active = "TRUE" if row["active"].lower() == "true" else "FALSE"
        lines.append(
            "  ("
            + ", ".join(
                [
                    sql_quote(row["drug"]),
                    sql_quote(row["drug_class"]),
                    sql_quote(row["display_name"]),
                    active,
                ]
            )
            + f"){suffix}"
        )
    lines.append("")

    lines.append("INSERT INTO drug_interactions (row_drug, col_drug, interaction_code, sampled_rgb, distance_to_canonical_rgb, source) VALUES")
    for i, row in enumerate(interaction_rows):
        suffix = "," if i < len(interaction_rows) - 1 else ";"
        lines.append(
            "  ("
            + ", ".join(
                [
                    sql_quote(row["row_drug"]),
                    sql_quote(row["col_drug"]),
                    sql_quote(row["interaction_code"]),
                    sql_quote(row["sampled_rgb"]),
                    row["distance_to_canonical_rgb"],
                    sql_quote(row["source"]),
                ]
            )
            + f"){suffix}"
        )
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    img_path = root / "tmp/pdfs/drug_chart-1.png"
    out_dir = root / "output/data"
    if not img_path.exists():
        raise SystemExit(f"Missing rendered chart PNG: {img_path}")

    img = np.array(Image.open(img_path).convert("RGB"))
    col_ranges, row_ranges = detect_grid_ranges(img)
    if len(col_ranges) < 27 or len(row_ranges) < 27:
        raise SystemExit(
            f"Unexpected grid geometry. cols={len(col_ranges)} rows={len(row_ranges)}"
        )

    # Expected layout: [left labels] + 25 matrix cols + [right labels]
    # and [top labels] + 25 matrix rows + [bottom labels].
    matrix_cols = col_ranges[1:26]
    matrix_rows = row_ranges[1:26]
    if len(matrix_cols) != len(DRUGS) or len(matrix_rows) != len(DRUGS):
        raise SystemExit(
            f"Matrix dimensions mismatch. matrix_cols={len(matrix_cols)} matrix_rows={len(matrix_rows)}"
        )

    long_rows: List[dict] = []
    matrix_rows_out: List[dict] = []
    distances: List[float] = []

    for r_idx, (y0, y1) in enumerate(matrix_rows):
        row_drug = DRUGS[r_idx]
        matrix_row = {"row_drug": row_drug}
        for c_idx, (x0, x1) in enumerate(matrix_cols):
            col_drug = DRUGS[c_idx]
            rgb = sample_cell_color(img, x0, x1 + 1, y0, y1 + 1)
            if r_idx == c_idx:
                legend = SELF_ENTRY
                dist = 0.0
            else:
                legend = nearest_legend(rgb)
                dist = float(np.linalg.norm(np.array(rgb) - np.array(legend.rgb)))
            long_rows.append(
                {
                    "row_drug": row_drug,
                    "row_drug_class": DRUG_CLASSES[row_drug],
                    "col_drug": col_drug,
                    "col_drug_class": DRUG_CLASSES[col_drug],
                    "interaction_code": legend.code,
                    "interaction_label": legend.label,
                    "interaction_symbol": legend.symbol,
                    "canonical_hex": legend.hex,
                    "sampled_rgb": f"{rgb[0]},{rgb[1]},{rgb[2]}",
                    "distance_to_canonical_rgb": f"{dist:.2f}",
                    "source": "Drug interaction chart.pdf",
                }
            )
            distances.append(dist)
            matrix_row[col_drug] = legend.code
        matrix_rows_out.append(matrix_row)

    legend_rows = [
        {
            "interaction_code": e.code,
            "interaction_label": e.label,
            "interaction_symbol": e.symbol,
            "canonical_hex": e.hex,
            "canonical_rgb": f"{e.rgb[0]},{e.rgb[1]},{e.rgb[2]}",
            "description": e.description,
            "source": "Drug interaction chart-colour-coding-guide.pdf",
        }
        for e in LEGEND
    ] + [
        {
            "interaction_code": SELF_ENTRY.code,
            "interaction_label": SELF_ENTRY.label,
            "interaction_symbol": SELF_ENTRY.symbol,
            "canonical_hex": SELF_ENTRY.hex,
            "canonical_rgb": f"{SELF_ENTRY.rgb[0]},{SELF_ENTRY.rgb[1]},{SELF_ENTRY.rgb[2]}",
            "description": SELF_ENTRY.description,
            "source": "Drug interaction chart.pdf",
        }
    ]

    drug_rows = [
        {"drug": d, "drug_class": DRUG_CLASSES[d], "display_name": d, "active": "true"}
        for d in DRUGS
    ]

    write_csv(
        out_dir / "drug_interactions_long.csv",
        long_rows,
        [
            "row_drug",
            "row_drug_class",
            "col_drug",
            "col_drug_class",
            "interaction_code",
            "interaction_label",
            "interaction_symbol",
            "canonical_hex",
            "sampled_rgb",
            "distance_to_canonical_rgb",
            "source",
        ],
    )
    write_csv(
        out_dir / "drug_interactions_matrix_codes.csv",
        matrix_rows_out,
        ["row_drug", *DRUGS],
    )
    write_csv(
        out_dir / "drug_interaction_legend.csv",
        legend_rows,
        [
            "interaction_code",
            "interaction_label",
            "interaction_symbol",
            "canonical_hex",
            "canonical_rgb",
            "description",
            "source",
        ],
    )
    write_csv(
        out_dir / "drug_metadata.csv",
        drug_rows,
        ["drug", "drug_class", "display_name", "active"],
    )
    write_json(
        out_dir / "drug_interactions_dataset.json",
        {
            "source_files": [
                "Drug interaction chart.pdf",
                "Drug interaction chart-colour-coding-guide.pdf",
            ],
            "drugs": drug_rows,
            "legend": legend_rows,
            "interactions": long_rows,
        },
    )
    write_sql_seed(
        out_dir / "drug_interactions_seed.sql",
        legend_rows=legend_rows,
        drug_rows=drug_rows,
        interaction_rows=long_rows,
    )

    # Basic quality checks.
    codes = [[None for _ in DRUGS] for _ in DRUGS]
    for row in long_rows:
        r = DRUGS.index(row["row_drug"])
        c = DRUGS.index(row["col_drug"])
        codes[r][c] = row["interaction_code"]
    asym = 0
    for i in range(len(DRUGS)):
        for j in range(len(DRUGS)):
            if codes[i][j] != codes[j][i]:
                asym += 1
    print(f"Symmetry mismatches: {asym}")
    print(f"Max color distance: {max(distances):.2f}")
    print(f"Mean color distance: {float(np.mean(distances)):.2f}")

    print("Wrote:")
    print("-", out_dir / "drug_interactions_long.csv")
    print("-", out_dir / "drug_interactions_matrix_codes.csv")
    print("-", out_dir / "drug_interaction_legend.csv")
    print("-", out_dir / "drug_metadata.csv")
    print("-", out_dir / "drug_interactions_dataset.json")
    print("-", out_dir / "drug_interactions_seed.sql")


if __name__ == "__main__":
    main()
