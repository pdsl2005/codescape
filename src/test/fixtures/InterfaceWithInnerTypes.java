package com.example.inner;

/**
 * Interface with nested interface.
 */
public interface OuterInterface {
    void outerMethod();

    /**
     * Nested interface.
     */
    interface NestedInterface {
        void nestedMethod();
    }

    /**
     * Nested class inside interface.
     */
    class NestedClassInInterface {
        public void classMethod() {
            System.out.println("Class inside interface");
        }
    }

    /**
     * Static nested interface.
     */
    static interface StaticNestedInterface {
        void staticNestedMethod();
    }

    /**
     * Inner class implementing nested interface.
     */
    class InnerImplementer implements NestedInterface {
        @Override
        public void nestedMethod() {
            System.out.println("Impl");
        }
    }
}
