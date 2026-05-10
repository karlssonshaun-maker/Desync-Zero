"""
Standalone retry worker entry point.
Run as a separate container — entirely decoupled from the API process.

Uses a Redis distributed lock (SET NX PX) so only ONE worker instance
processes the retry queue at a time, eliminating duplicate-sync races
when you scale horizontally.
"""
import asyncio
import logging

from app.services.retry_worker import retry_worker_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

if __name__ == "__main__":
    asyncio.run(retry_worker_loop(poll_interval_seconds=5.0))
