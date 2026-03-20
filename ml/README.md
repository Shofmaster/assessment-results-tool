# Logbook HTR Training Workspace

This folder contains the training and evaluation workspace for improving logbook handwriting recognition.

## Scope

- Baseline current OCR + parser quality with reproducible metrics.
- Prepare legal, traceable training/eval datasets.
- Run pilot model comparisons on the same held-out set.
- Gate model promotion with regression checks.
- Define an active-learning loop for human corrections.

## Quick start

1. Create a Python 3.11+ virtual environment.
2. Install dependencies:
   - `pip install -r ml/requirements.txt`
3. Prepare eval data:
   - Gold labels in `ml/data/eval_gold.jsonl`
   - Predictions in `ml/data/predictions/<system>.jsonl`
4. Run evaluation:
   - `python ml/eval/run_eval.py --gold ml/data/eval_gold.jsonl --pred ml/data/predictions/current_claude.jsonl --out ml/reports/current_claude_eval.json`
5. Check regression against baseline:
   - `python ml/eval/check_regression.py --baseline ml/reports/current_claude_eval.json --candidate ml/reports/pilot_a_eval.json`

## Canonical data format

JSONL record fields used by the evaluators:

- `id` (string): stable sample id.
- `text` (string): full transcription for CER/WER.
- `tokens` (object, optional): normalized domain tokens, for example:
  - `ata`, `ad`, `sb`, `time_hours`, `cycles`, `landings`, `cert`.
- `fields` (object, optional): parsed structured fields for end-to-end scoring.

Use identical `id` values in gold and prediction files.

## Folder map

- `ml/data/`: dataset manifests, policy docs, and JSONL files.
- `ml/synthetic/`: synthetic data generator scripts.
- `ml/eval/`: metric calculation and regression gates.
- `ml/pilots/`: pilot run matrix + comparison tooling.
- `ml/active_learning/`: correction schema and ingestion notes.
- `ml/reports/`: generated metric outputs (gitignored if desired).
