import asyncio
import os
import time

def add(left, right=1):
    return left + right

def summarize(values, *, factor=1):
    print("native Python diagnostic 🌉")
    return {"value": sum(values) * factor, "nested": [True, None, "سلام 🌉"]}

def delayed(value, seconds=0.05):
    time.sleep(seconds)
    return value

async def asynchronous(value):
    await asyncio.sleep(0.01)
    return value * 2

def broken(value):
    if value < 0:
        raise ValueError("native bridge expected failure")
    return value

def excessive():
    return "x" * 8192

def nonfinite():
    return float("nan")

def directory():
    return os.getcwd()
