from functools import lru_cache


class Service:
    category: str = "svc"

    def __init__(self, enabled: bool = True):
        self.enabled = enabled

    @classmethod
    async def build(cls, name: str):
        return cls()

    @staticmethod
    def version() -> str:
        return "1.0"


@lru_cache
async def fetch_status(name: str) -> str:
    return name
