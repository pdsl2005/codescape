public class ShuttleService {
  private TransitHub hub;

  public ShuttleService(TransitHub hub) {
    this.hub = hub;
  }

  public TransitHub getHub() {
    return hub;
  }
}
