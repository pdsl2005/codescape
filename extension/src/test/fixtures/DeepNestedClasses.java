package com.example.nested;

/**
 * Example with multiple levels of nesting.
 */
public class Outermost {
    public class FirstLevel {
        public class SecondLevel {
            public void deepMethod() {
                System.out.println("Three levels deep");
            }

            public class ThirdLevel {
                public void veryDeepMethod() {
                    System.out.println("Four levels deep");
                }
            }
        }

        public static class FirstLevelStatic {
            public void staticDeepMethod() {
                System.out.println("Static inside first level");
            }
        }
    }

    public static class OutermostStatic {
        public class NestedInStatic {
            public void nestedStaticMethod() {
                System.out.println("Inner non-static inside outer static");
            }
        }
    }
}
