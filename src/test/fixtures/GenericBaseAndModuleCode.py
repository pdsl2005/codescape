"""Module docstring should not become module code."""

from .pkg import helper


class Repository(BaseModel[str], AuditMixin):
    pass


if __name__ == "__main__":
    print("run")


VALUE = 10
