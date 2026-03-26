package com.example.interfaces;

public interface Printable extends Displayable, Formattable {
    void print();
    String format();
}
