"""
Author: Kishore Kumar
Parse bank credit alerts (SMS / email text) into amount, UTR and order reference.
"""

import re
from dataclasses import dataclass, field
from typing import Optional

_AMOUNT = re.compile(r"(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)", re.I)
# "Avl Bal Rs 12,345.00" must not be mistaken for the credited amount.
_BALANCE = re.compile(r"(?:avl\.?|available|total|clear|closing)?\s*bal(?:ance)?\.?\s*(?:is|:|-)?\s*(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?", re.I)
_UTR_LABELLED = re.compile(r"(?:utr|rrn|upi\s*ref(?:erence)?(?:\s*no)?|ref(?:erence)?\s*(?:no|number|id)?|txn\s*id|transaction\s*id)\.?\s*[:#\-]?\s*(\d{12})\b", re.I)
_UTR_ANY = re.compile(r"(?<!\d)(\d{12})(?!\d)")
_ORDER_REF = re.compile(r"\bJP[0-9A-F]{6}\b", re.I)
_CREDIT = re.compile(r"\bcredited\b|\bcredit\s+of\b|\breceived\b|\bdeposited\b|/CR/|\bCR\b", re.I)
_DEBIT = re.compile(r"\bdebited\b|\bwithdrawn\b|/DR/|\bDR\b", re.I)


@dataclass
class ParsedAlert:
    is_credit: bool
    amounts_paise: list[int] = field(default_factory=list)
    utr: Optional[str] = None
    order_ref: Optional[str] = None


def to_paise(raw: str) -> int:
    return round(float(raw.replace(",", "")) * 100)


def parse_alert(text: str) -> ParsedAlert:
    credit = bool(_CREDIT.search(text)) and not (_DEBIT.search(text) and not re.search(r"\bcredited\b", text, re.I))
    cleaned = _BALANCE.sub(" ", text)
    amounts = []
    for raw in _AMOUNT.findall(cleaned):
        try:
            paise = to_paise(raw)
        except ValueError:
            continue
        if paise > 0 and paise not in amounts:
            amounts.append(paise)
    utr_match = _UTR_LABELLED.search(text) or _UTR_ANY.search(text)
    ref = _ORDER_REF.search(text)
    return ParsedAlert(
        is_credit=credit, amounts_paise=amounts,
        utr=utr_match.group(1) if utr_match else None,
        order_ref=ref.group(0).upper() if ref else None,
    )
