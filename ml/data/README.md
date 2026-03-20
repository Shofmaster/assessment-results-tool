# Data Governance and Dataset Strategy

## Allowed sources

- Licensed public handwriting datasets with terms that permit model training.
- Synthetic datasets generated in-house (`ml/synthetic/`).
- Customer or partner logbook samples with explicit opt-in and documented consent.

## Disallowed sources

- Unrestricted web scraping of handwriting images.
- Data without clear ownership, consent, or license terms.
- Any source containing sensitive PII without an approved redaction pipeline.

## Required metadata for each sample

Every sample in train/val/test manifests should track:

- `sample_id`
- `source_type` (`public`, `synthetic`, `customer_opt_in`)
- `source_name`
- `license_or_consent_ref`
- `contains_pii` (`true` / `false`)
- `deidentified` (`true` / `false`)
- `split` (`train`, `val`, `test`)

## Split policy

- No leakage: same physical page or near-duplicate lines cannot cross splits.
- Keep held-out test set frozen per release cycle.
- Maintain style diversity in each split (cursive, block, mixed, degraded scans).

## Suggested manifests

- `ml/data/manifests/train_manifest.jsonl`
- `ml/data/manifests/val_manifest.jsonl`
- `ml/data/manifests/test_manifest.jsonl`

Each JSONL row should include metadata above plus path pointers to image + ground truth text.
