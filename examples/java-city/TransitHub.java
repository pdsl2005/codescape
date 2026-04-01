public class TransitHub {
  private RouteMap routeMap;
  private Gate primaryGate;

  public TransitHub(RouteMap routeMap, Gate primaryGate) {
    this.routeMap = routeMap;
    this.primaryGate = primaryGate;
  }

  public RouteMap getRouteMap() {
    return routeMap;
  }

  public Gate getPrimaryGate() {
    return primaryGate;
  }

  static class Gate {
    private int gateNumber;

    Gate(int gateNumber) {
      this.gateNumber = gateNumber;
    }

    public int getGateNumber() {
      return gateNumber;
    }
  }
}
