from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Dict, List, Mapping

from metrics import cer, field_accuracy, normalized_edit_similarity, token_f1, wer


def load_jsonl(path: Path) -> List[dict]:
    rows: List[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def index_by_id(rows: List[dict]) -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for row in rows:
        sample_id = str(row["id"])
        out[sample_id] = row
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate OCR + parsing quality.")
    parser.add_argument("--gold", type=Path, required=True, help="Path to gold JSONL.")
    parser.add_argument("--pred", type=Path, required=True, help="Path to prediction JSONL.")
    parser.add_argument("--out", type=Path, required=True, help="Path to output JSON report.")
    args = parser.parse_args()

    gold_rows = load_jsonl(args.gold)
    pred_rows = load_jsonl(args.pred)
    pred_by_id = index_by_id(pred_rows)

    aligned_gold: List[dict] = []
    aligned_pred: List[dict] = []
    missing = 0
    for g in gold_rows:
        pid = str(g["id"])
        p = pred_by_id.get(pid)
        if not p:
            missing += 1
            continue
        aligned_gold.append(g)
        aligned_pred.append(p)

    if not aligned_gold:
        raise RuntimeError("No aligned samples found between gold and prediction files.")

    cer_values = [cer(g.get("text", ""), p.get("text", "")) for g, p in zip(aligned_gold, aligned_pred)]
    wer_values = [wer(g.get("text", ""), p.get("text", "")) for g, p in zip(aligned_gold, aligned_pred)]
    nes_values = [
        normalized_edit_similarity(g.get("text", ""), p.get("text", ""))
        for g, p in zip(aligned_gold, aligned_pred)
    ]

    token_keys = ["ata", "ad", "sb", "time_hours", "cycles", "landings", "cert"]
    gold_tokens = [g.get("tokens", {}) for g in aligned_gold]
    pred_tokens = [p.get("tokens", {}) for p in aligned_pred]
    token_scores = token_f1(gold_tokens, pred_tokens, token_keys)

    field_keys = [
        "entryDate",
        "workPerformed",
        "ataChapter",
        "totalTimeAtEntry",
        "totalCyclesAtEntry",
        "totalLandingsAtEntry",
        "signerName",
        "signerCertNumber",
    ]
    gold_fields = [g.get("fields", {}) for g in aligned_gold]
    pred_fields = [p.get("fields", {}) for p in aligned_pred]
    field_scores = field_accuracy(gold_fields, pred_fields, field_keys)

    report = {
        "sample_count": len(aligned_gold),
        "missing_predictions": missing,
        "ocr": {
            "cer_mean": mean(cer_values),
            "wer_mean": mean(wer_values),
            "normalized_edit_similarity_mean": mean(nes_values),
        },
        "domain_tokens": {
            k: {"precision": v.precision, "recall": v.recall, "f1": v.f1}
            for k, v in token_scores.items()
        },
        "structured_fields": field_scores,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote report: {args.out}")


if __name__ == "__main__":
    main()
