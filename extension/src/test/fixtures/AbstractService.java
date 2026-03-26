package com.example.services;

public abstract class AbstractService extends BaseService implements Serializable, Loggable {
    private static final int MAX_RETRIES = 3;
    protected boolean initialized = false;

    public AbstractService() {
        this.initialized = false;
    }

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
