import os
import sys
from typing import List
from collections import defaultdict

MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30


def greet(name: str) -> str:
    return f"Hello, {name}"


def add(a: int, b: int) -> int:
    return a + b
