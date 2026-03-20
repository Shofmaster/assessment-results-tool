from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Mapping, Sequence, Tuple

from rapidfuzz.distance import Levenshtein


def _tokenize_words(text: str) -> List[str]:
    return [w for w in text.strip().split() if w]


def cer(reference: str, hypothesis: str) -> float:
    ref = reference or ""
    hyp = hypothesis or ""
    if len(ref) == 0:
        return 0.0 if len(hyp) == 0 else 1.0
    return Levenshtein.distance(ref, hyp) / len(ref)


def wer(reference: str, hypothesis: str) -> float:
    ref_words = _tokenize_words(reference)
    hyp_words = _tokenize_words(hypothesis)
    if len(ref_words) == 0:
        return 0.0 if len(hyp_words) == 0 else 1.0
    return Levenshtein.distance(ref_words, hyp_words) / len(ref_words)


def normalized_edit_similarity(reference: str, hypothesis: str) -> float:
    ref = reference or ""
    hyp = hypothesis or ""
    max_len = max(len(ref), len(hyp))
    if max_len == 0:
        return 1.0
    dist = Levenshtein.distance(ref, hyp)
    return 1.0 - (dist / max_len)


@dataclass
class TokenMetrics:
    precision: float
    recall: float
    f1: float


def token_f1(
    gold: Iterable[Mapping[str, str]],
    pred: Iterable[Mapping[str, str]],
    keys: Sequence[str],
) -> Dict[str, TokenMetrics]:
    gold_list = list(gold)
    pred_list = list(pred)
    out: Dict[str, TokenMetrics] = {}
    for key in keys:
        tp = fp = fn = 0
        for g, p in zip(gold_list, pred_list):
            gv = str(g.get(key, "")).strip().lower()
            pv = str(p.get(key, "")).strip().lower()
            if gv and pv and gv == pv:
                tp += 1
            elif gv and pv and gv != pv:
                fp += 1
                fn += 1
            elif gv and not pv:
                fn += 1
            elif not gv and pv:
                fp += 1
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        out[key] = TokenMetrics(precision=precision, recall=recall, f1=f1)
    return out


def field_accuracy(
    gold: Iterable[Mapping[str, object]],
    pred: Iterable[Mapping[str, object]],
    keys: Sequence[str],
) -> Dict[str, float]:
    gold_list = list(gold)
    pred_list = list(pred)
    accuracies: Dict[str, float] = {}
    for key in keys:
        total = 0
        correct = 0
        for g, p in zip(gold_list, pred_list):
            if key not in g:
                continue
            total += 1
            if g.get(key) == p.get(key):
                correct += 1
        accuracies[key] = (correct / total) if total else 0.0
    return accuracies
