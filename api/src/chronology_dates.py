"""Event dates must be grounded in source content, never system metadata."""
import re
from datetime import datetime
from dateutil.parser import parse

CONTENT_DATE_SOURCES = {"content_header", "content_body", "table_period"}
_SYSTEM_DATE = re.compile(
    r"^\s*(?:upload(?:ed)?(?:[_\s]+(?:at|on|date))?|ingest(?:ed)?(?:[_\s]+(?:at|on|date))?|"
    r"index(?:ed)?(?:[_\s]+(?:at|on|date))?|process(?:ed)?(?:[_\s]+(?:at|on|date))?|"
    r"created_at|updated_at|file_mtime|file\s+(?:created|modified|creation\s+date)|last\s+modified)\s*[:=]", re.I,
)
_DATE_PATTERNS = {
    "exact": r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|"
             r"\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?[,\s]+\d{4}|"
             r"[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+\d{4})\b",
    "month": r"\b(?:\d{4}-\d{2}|[A-Za-z]{3,9}\.?\s+\d{4})\b",
    "year": r"\b\d{4}\b",
}


def event_date_is_grounded(value, precision, source, quote, excerpts):
    """Check provenance, calendar validity and the normalized quoted date."""
    value, quote = str(value or "").strip(), str(quote or "").strip()
    if source not in CONTENT_DATE_SOURCES or not value or not quote:
        return False
    precision = "exact" if precision == "day" else precision
    if precision == "approximate":
        precision = {4: "year", 7: "month", 10: "exact"}.get(len(value))
    fmt = {"exact": "%Y-%m-%d", "month": "%Y-%m", "year": "%Y"}.get(precision)
    if not fmt:
        return False
    try:
        if datetime.strptime(value, fmt).strftime(fmt) != value:
            return False
    except ValueError:
        return False
    # Do not join excerpts: a quotation cannot bridge two unrelated sources.
    grounded = False
    for excerpt in excerpts:
        text = str(excerpt or "")
        for match in re.finditer(re.escape(quote), text, re.I):
            start = text.rfind("\n", 0, match.start()) + 1
            context = text[start:match.end()]
            if not any(_SYSTEM_DATE.match(line) for line in context.splitlines()):
                grounded = True
    if not grounded:
        return False
    for match in re.finditer(_DATE_PATTERNS[precision], quote):
        token = match.group()
        try:
            # ISO is unambiguous; dayfirst applies only to non-ISO source dates.
            dt = parse(token, dayfirst=not bool(re.match(r"^\d{4}-", token)),
                       default=datetime(1900, 1, 1))
            if dt.strftime(fmt) == value:
                return True
        except (ValueError, OverflowError):
            continue
    return False
