package com.example.multi;

public class OuterClass {
    public void outerMethod() {}

    class InnerClass extends OuterClass {
        public void innerMethod() {}
    }
}

final class UtilityClass {
    public static void helperMethod() {}
}
