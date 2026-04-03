class Dog:
    species: str = "Canis familiaris"

    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age

    def speak(self) -> str:
        return f"{self.name} says woof"

    def get_age(self) -> int:
        return self.age
