from abc import ABC, abstractmethod


class Shape(ABC):
    def __init__(self, color: str):
        self.color = color

    @abstractmethod
    def area(self) -> float:
        pass

    @abstractmethod
    def perimeter(self) -> float:
        pass

    def describe(self) -> str:
        return f"A {self.color} shape"
