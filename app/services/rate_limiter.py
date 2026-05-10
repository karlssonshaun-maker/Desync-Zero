import time
import asyncio
from redis.asyncio import Redis


class TokenBucketRateLimiter:
    def __init__(
        self,
        redis: Redis,
        bucket_key: str,
        capacity: int,
        refill_rate_per_minute: int,
    ):
        self._redis = redis
        self._bucket_key = bucket_key
        self._capacity = capacity
        self._refill_rate = refill_rate_per_minute
        self._tokens_key = f"rate_limiter:{bucket_key}:tokens"
        self._last_refill_key = f"rate_limiter:{bucket_key}:last_refill"

    async def acquire(self, tokens: int = 1) -> bool:
        lua_script = """
        local tokens_key = KEYS[1]
        local last_refill_key = KEYS[2]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local requested = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])

        local current_tokens = tonumber(redis.call('GET', tokens_key))
        local last_refill = tonumber(redis.call('GET', last_refill_key))

        if current_tokens == nil then
            current_tokens = capacity
        end
        if last_refill == nil then
            last_refill = now
        end

        local elapsed_seconds = now - last_refill
        local refill_per_second = refill_rate / 60.0
        local new_tokens = math.min(capacity, current_tokens + (elapsed_seconds * refill_per_second))

        if new_tokens >= requested then
            redis.call('SET', tokens_key, new_tokens - requested, 'EX', 120)
            redis.call('SET', last_refill_key, now, 'EX', 120)
            return 1
        else
            redis.call('SET', tokens_key, new_tokens, 'EX', 120)
            redis.call('SET', last_refill_key, now, 'EX', 120)
            return 0
        end
        """
        now = time.time()
        result = await self._redis.eval(
            lua_script,
            2,
            self._tokens_key,
            self._last_refill_key,
            self._capacity,
            self._refill_rate,
            tokens,
            now,
        )
        return bool(result)

    async def acquire_with_wait(self, tokens: int = 1, max_wait_seconds: float = 30.0):
        wait_interval = 0.5
        total_waited = 0.0
        while total_waited < max_wait_seconds:
            if await self.acquire(tokens):
                return
            await asyncio.sleep(wait_interval)
            total_waited += wait_interval
        raise TimeoutError(
            f"Rate limiter bucket '{self._bucket_key}' exhausted after {max_wait_seconds}s wait"
        )
