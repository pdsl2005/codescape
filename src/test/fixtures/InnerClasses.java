package com.example.inner;

/**
 * Example demonstrating various inner class scenarios.
 */
public class OuterClass {
    private String outerField;

    public OuterClass(String value) {
        this.outerField = value;
    }

    public void outerMethod() {
        System.out.println("Outer method");
    }

    /**
     * Non-static inner class (instance inner class).
     * Has access to outer instance members.
     */
    public class InstanceInnerClass {
        private int innerField;

        public InstanceInnerClass(int value) {
            this.innerField = value;
        }

        public void innerMethod() {
            System.out.println(outerField + ": " + innerField);
        }

        public int getInnerField() {
            return innerField;
        }
    }

    /**
     * Static nested class.
     * Does NOT have access to outer instance members.
     */
    public static class StaticNestedClass {
        private String staticField;

        public StaticNestedClass(String value) {
            this.staticField = value;
        }

        public void staticMethod() {
            System.out.println(staticField);
        }
    }

    /**
     * Private inner class.
     */
    private class PrivateInnerClass {
        public void privateMethod() {
            System.out.println("Private");
        }
    }

    /**
     * Protected inner class.
     */
    protected class ProtectedInnerClass {
        public void protectedMethod() {
            System.out.println("Protected");
        }
    }

    /**
     * Final inner class.
     */
    public final class FinalInnerClass {
        public void finalMethod() {
            System.out.println("Final inner");
        }
    }

    /**
     * Abstract inner class.
     */
    public abstract class AbstractInnerClass {
        public abstract void abstractMethod();

        public void concreteMethod() {
            System.out.println("Concrete");
        }
    }
}
