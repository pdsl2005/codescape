class Outer:
    """Outer class with nested inner."""

    class Inner:
        def inner_method(self) -> int:
            return 1

    def outer_method(self) -> None:
        pass
