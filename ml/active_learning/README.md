# Active Learning Loop for Logbook OCR

## Goal

Capture user corrections on low-confidence OCR output and convert them into high-value training examples.

## Proposed loop

1. Flag low-confidence OCR segments (for example confidence `< 0.78`).
2. Present side-by-side original image crop + current transcript in admin review UI.
3. Collect corrected transcript and optional structured field corrections.
4. Store correction records in an append-only dataset.
5. Run periodic retraining/fine-tuning using newly approved corrections.
6. Re-evaluate on frozen held-out set before promotion.

## Correction schema (JSONL)

Each correction record:

- `id`: unique correction id.
- `sample_id`: source sample id.
- `image_path`: local or object storage pointer.
- `ocr_text_before`: previous OCR output.
- `ocr_text_after`: human-corrected text.
- `model_version`: model that produced `ocr_text_before`.
- `reviewed_by`: reviewer id.
- `reviewed_at`: ISO timestamp.
- `approved_for_training`: boolean.

## Promotion gate

No model promotion unless:

- `ml/eval/check_regression.py` passes against current baseline.
- New model improves at least one primary metric (CER or WER) without violating field-accuracy thresholds.
