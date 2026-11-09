def summarize(values):
    """Process the entire list in one Python invocation."""
    print("processed one batch")
    return {
        "count": len(values),
        "sum": sum(values),
        "mean": sum(values) / len(values) if values else None,
        "doubled": [value * 2 for value in values],
    }
