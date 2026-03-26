package com.example.model;

public class PersonClass {
    private String name;
    private int age;
    public static final String DEFAULT_NAME = "Unknown";

    public PersonClass() {
        this.name = DEFAULT_NAME;
        this.age = 0;
    }

    public PersonClass(String name, int age) {
        this.name = name;
        this.age = age;
    }

    public String getName() {
        return name;
    }

    public int getAge() {
        return age;
    }
}
