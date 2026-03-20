# Logbook OCR Baseline Procedure

This document defines how to baseline the current OCR + parsing pipeline before introducing new models.

## 1) Build held-out eval set

- Target 200-500 pages representative of production.
- Include cursive, block, mixed handwriting, faint scans, low DPI, and noisy backgrounds.
- Produce gold labels in `ml/data/eval_gold.jsonl`.

## 2) Generate baseline predictions

- Run current production OCR pipeline and parser on the held-out set.
- Save outputs in:
  - `ml/data/predictions/current_claude.jsonl`

## 3) Compute baseline metrics

Run:

- `python ml/eval/run_eval.py --gold ml/data/eval_gold.jsonl --pred ml/data/predictions/current_claude.jsonl --out ml/reports/current_claude_eval.json`

## 4) Required baseline outputs

- Mean CER/WER.
- Domain token precision/recall/F1 (`ata`, `ad`, `sb`, `time_hours`, `cycles`, `landings`, `cert`).
- Structured field accuracy for key logbook fields.

## 5) Publish and freeze

- Commit `ml/reports/current_claude_eval.json`.
- Use this report as `--baseline` input to regression gates for pilot models.
