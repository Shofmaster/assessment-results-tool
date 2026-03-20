# Pilot Run Playbook

Use this playbook to run and compare two pilot approaches on a fixed eval set.

## Pilot candidates

- Pilot A: specialist HTR model fine-tuned on line/region crops.
- Pilot B: hybrid detection + OCR + token correction.

## Steps

1. Generate predictions for each pilot:
   - `ml/data/predictions/pilot_a.jsonl`
   - `ml/data/predictions/pilot_b.jsonl`
2. Evaluate each pilot:
   - `python ml/eval/run_eval.py --gold ml/data/eval_gold.jsonl --pred ml/data/predictions/pilot_a.jsonl --out ml/reports/pilot_a_eval.json`
   - `python ml/eval/run_eval.py --gold ml/data/eval_gold.jsonl --pred ml/data/predictions/pilot_b.jsonl --out ml/reports/pilot_b_eval.json`
3. Compare against baseline:
   - `python ml/pilots/compare_pilots.py --matrix ml/pilots/pilot_matrix.example.yaml`
4. Apply regression gates:
   - `python ml/eval/check_regression.py --baseline ml/reports/current_claude_eval.json --candidate ml/reports/pilot_a_eval.json`
   - `python ml/eval/check_regression.py --baseline ml/reports/current_claude_eval.json --candidate ml/reports/pilot_b_eval.json`

## Decision criteria

- Prefer lower CER and WER.
- Reject any candidate that fails field-level regression gates.
- Use cost and latency as tie-breakers after quality.
