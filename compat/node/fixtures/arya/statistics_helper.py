"""An ordinary Python module; Arya needs no custom decorator or SDK."""
import statistics


def summarize(values):
    return {"count": len(values), "mean": statistics.mean(values)}


def round_mean(values, *, digits=2):
    return round(statistics.mean(values), digits)
