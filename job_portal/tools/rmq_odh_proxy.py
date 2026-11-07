# Author: Kishore Kumar
#!/usr/bin/env python3
"""
RabbitMQ → ODH HTTP proxy for local development.

The RCA service cannot reach ODH directly (internal lab DNS / VPN required).
Run THIS script on any machine that has BOTH:
  - RabbitMQ access  (RABBITMQ_URL)
  - ODH / lab network access (with VPN, or on a lab host)

It binds to the same exchange + routing key the RCA service publishes to,
makes the actual HTTP call to ODH, and replies via the callback queue.

Quick start (requires aio-pika and httpx — already in requirements.txt):
    cd rca_service
    pip install aio-pika httpx          # if not already installed
    python tools/rmq_odh_proxy.py

Environment variables (required / override via shell or .env):
    RABBITMQ_URL          amqp://<user>:<password>@<host>:<port>/<vhost>  (required)
    EXCHANGE_INSPECTOR    inspectormanager   (default)
    PUB_RMQ2HTTP          sendHttpRequests   (default)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal

import aio_pika
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

RABBITMQ_URL: str = os.environ["RABBITMQ_URL"]
EXCHANGE_NAME: str = os.environ.get("EXCHANGE_INSPECTOR", "inspectormanager")
ROUTING_KEY: str = os.environ.get("PUB_RMQ2HTTP", "sendHttpRequests")
QUEUE_NAME: str = "rca-odh-proxy"


async def _handle(message: aio_pika.IncomingMessage, channel: aio_pika.abc.AbstractChannel) -> None:
    async with message.process():
        reply_body: bytes = b"{}"
        try:
            payload: dict = json.loads(message.body)
            url: str = payload["url"]
            opts: dict = payload.get("options", {})
            method: str = opts.get("method", "GET").upper()
            headers: dict = opts.get("headers", {})
            raw_body = opts.get("body")
            timeout: float = opts.get("timeout", 30_000) / 1000.0

            logger.info("→ %s %s", method, url)
            async with httpx.AsyncClient(timeout=timeout) as client:
                kwargs: dict = {"headers": headers}
                if raw_body is not None:
                    kwargs["content"] = (
                        raw_body.encode() if isinstance(raw_body, str) else raw_body
                    )
                resp = await client.request(method, url, **kwargs)
            logger.info("← %d %s", resp.status_code, url)
            reply_body = resp.content

        except Exception as exc:  # noqa: BLE001
            logger.error("Proxy error: %s", exc)
            reply_body = json.dumps({"error": str(exc)}).encode()

        if message.reply_to:
            await channel.default_exchange.publish(
                aio_pika.Message(
                    body=reply_body,
                    content_type="application/json",
                    correlation_id=message.correlation_id,
                ),
                routing_key=message.reply_to,
            )


async def main() -> None:
    logger.info("Connecting to RabbitMQ …  %s", RABBITMQ_URL)
    connection = await aio_pika.connect_robust(RABBITMQ_URL)

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=4)

        # Use the existing exchange — don't re-declare to avoid type conflicts
        exchange = await channel.get_exchange(EXCHANGE_NAME)

        queue = await channel.declare_queue(QUEUE_NAME, durable=True)
        await queue.bind(exchange, routing_key=ROUTING_KEY)

        logger.info(
            "Ready  exchange=%-20s  routing_key=%-20s  queue=%s",
            EXCHANGE_NAME, ROUTING_KEY, QUEUE_NAME,
        )

        await queue.consume(lambda msg: _handle(msg, channel))

        loop = asyncio.get_running_loop()
        stop: asyncio.Future = loop.create_future()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop.set_result, None)

        logger.info("Forwarding requests — press Ctrl+C to stop.")
        await stop
        logger.info("Shutting down.")


if __name__ == "__main__":
    asyncio.run(main())
