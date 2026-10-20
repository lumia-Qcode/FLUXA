"""Benchmark streaming latency: time to first outline event and time to first slide."""

import json
import time
import urllib.request


def benchmark_stream(topic: str = "Enterprise Autonomous Fleet 2026 Strategy"):
    req_body = json.dumps({
        "topic": topic,
        "slide_count": 8,
        "stream": True,
    }).encode("utf-8")

    req = urllib.request.Request(
        "http://127.0.0.1:5000/api/presentations/generate",
        data=req_body,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )

    start_time = time.time()
    first_outline_time = None
    first_slide_time = None

    with urllib.request.urlopen(req) as response:
        for line in response:
            line_str = line.decode("utf-8")
            now = time.time()
            if "event: outline" in line_str and first_outline_time is None:
                first_outline_time = now - start_time
            elif "event: slide" in line_str and first_slide_time is None:
                first_slide_time = now - start_time
            elif "event: done" in line_str:
                break

    total_time = time.time() - start_time

    return {
        "time_to_first_outline_ms": round((first_outline_time or 0) * 1000, 1),
        "time_to_first_slide_ms": round((first_slide_time or 0) * 1000, 1),
        "total_stream_time_ms": round(total_time * 1000, 1),
    }


if __name__ == "__main__":
    result = benchmark_stream()
    print("Benchmark streaming metrics:", result)
