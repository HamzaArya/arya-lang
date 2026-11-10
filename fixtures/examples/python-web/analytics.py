"""Small Python data-processing helper; no third-party packages required."""

import csv
import io
import math
import statistics


def summarize_csv(text, *, column="amount", digits=2):
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames or column not in reader.fieldnames:
        raise ValueError("CSV must contain the requested column")

    values = []

    for row in reader:
        if len(values) >= 10_000:
            raise ValueError("CSV must contain at most 10000 data rows")

        try:
            value = float(row[column])
        except (ValueError, TypeError):
            raise ValueError("CSV values must be numbers") from None

        if not math.isfinite(value):
            raise ValueError("CSV values must be finite numbers")

        values.append(value)

    if not values:
        raise ValueError("CSV must contain at least one data row")

    return {
        "count": len(values),
        "total": round(math.fsum(values), digits),
        "mean": round(statistics.mean(values), digits),
        "median": round(statistics.median(values), digits),
        "minimum": min(values),
        "maximum": max(values),
    }
