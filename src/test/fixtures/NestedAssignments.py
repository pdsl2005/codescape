class Config:
    def __init__(self, enabled: bool, retries: int):
        if enabled:
            self.mode = "enabled"
        else:
            self.mode = "disabled"

        for _ in range(retries):
            self.retries = retries

        while False:
            self.never = True

        try:
            self.status = "ok"
        except Exception:
            self.status = "error"

        with open(__file__) as handle:
            self.path = handle.name
