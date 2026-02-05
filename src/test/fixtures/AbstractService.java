package com.example.services;

public abstract class AbstractService extends BaseService implements Serializable, Loggable {

    public void start() {
        initialize();
    }

    protected abstract void initialize();

    public void stop() {
        cleanup();
    }

    private void cleanup() {
        // cleanup resources
    }
}
