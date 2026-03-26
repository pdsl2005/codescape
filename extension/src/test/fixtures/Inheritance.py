class Animal:
    def __init__(self, name: str):
        self.name = name

    def speak(self) -> str:
        return ""


class Dog(Animal):
    def __init__(self, name: str, breed: str):
        self.name = name
        self.breed = breed

    def speak(self) -> str:
        return "woof"


class GuideDog(Dog, object):
    def __init__(self, name: str, breed: str, owner: str):
        self.name = name
        self.breed = breed
        self.owner = owner
