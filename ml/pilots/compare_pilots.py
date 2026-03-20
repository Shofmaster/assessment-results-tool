from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

import yaml


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare pilot OCR/HTR reports against baseline.")
    parser.add_argument("--matrix", type=Path, required=True, help="YAML matrix config file.")
    args = parser.parse_args()

    cfg = yaml.safe_load(args.matrix.read_text(encoding="utf-8"))
    baseline = load_json(Path(cfg["baseline_report"]))
    b_cer = float(baseline["ocr"]["cer_mean"])
    b_wer = float(baseline["ocr"]["wer_mean"])

    print("name,cer,wer,delta_cer,delta_wer,score,notes")
    for pilot in cfg.get("pilots", []):
        report = load_json(Path(pilot["report"]))
        cer_val = float(report["ocr"]["cer_mean"])
        wer_val = float(report["ocr"]["wer_mean"])
        delta_cer = cer_val - b_cer
        delta_wer = wer_val - b_wer
        # Lower CER/WER is better. Weighted aggregate for quick triage.
        score = -(0.6 * delta_cer + 0.4 * delta_wer)
        print(
            f'{pilot["name"]},{cer_val:.4f},{wer_val:.4f},{delta_cer:+.4f},{delta_wer:+.4f},{score:+.4f},"{pilot.get("notes","")}"'
        )


if __name__ == "__main__":
    main()
