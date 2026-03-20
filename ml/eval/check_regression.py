from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_report(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Block model promotion on quality regressions.")
    parser.add_argument("--baseline", type=Path, required=True, help="Baseline report JSON.")
    parser.add_argument("--candidate", type=Path, required=True, help="Candidate report JSON.")
    parser.add_argument("--max-cer-increase", type=float, default=0.01)
    parser.add_argument("--max-wer-increase", type=float, default=0.01)
    parser.add_argument("--min-field-accuracy-drop", type=float, default=0.03)
    args = parser.parse_args()

    baseline = load_report(args.baseline)
    candidate = load_report(args.candidate)

    b_cer = float(baseline["ocr"]["cer_mean"])
    c_cer = float(candidate["ocr"]["cer_mean"])
    b_wer = float(baseline["ocr"]["wer_mean"])
    c_wer = float(candidate["ocr"]["wer_mean"])

    failures: list[str] = []
    if (c_cer - b_cer) > args.max_cer_increase:
        failures.append(f"CER regressed: baseline={b_cer:.4f}, candidate={c_cer:.4f}")
    if (c_wer - b_wer) > args.max_wer_increase:
        failures.append(f"WER regressed: baseline={b_wer:.4f}, candidate={c_wer:.4f}")

    baseline_fields = baseline.get("structured_fields", {})
    candidate_fields = candidate.get("structured_fields", {})
    for key, b_val in baseline_fields.items():
        c_val = float(candidate_fields.get(key, 0.0))
        if (float(b_val) - c_val) > args.min_field_accuracy_drop:
            failures.append(
                f"Field accuracy regressed on {key}: baseline={float(b_val):.4f}, candidate={c_val:.4f}"
            )

    if failures:
        print("Regression gate failed:")
        for msg in failures:
            print(f"- {msg}")
        raise SystemExit(1)

    print("Regression gate passed.")


if __name__ == "__main__":
    main()
