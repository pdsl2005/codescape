package com.example.abstractmethods;

public abstract class AbstractMethods {
    public abstract void abstractMethod();

    protected abstract String abstractWithReturn();

    public abstract void abstractWithParams(int x, String y);

    public void concreteMethod() {
        // Concrete implementation
    }

    public static void staticMethod() {
        // Static method in abstract class
    }
}
