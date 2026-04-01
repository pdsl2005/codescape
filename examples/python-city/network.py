class BaseStation:
    def __init__(self, district):
        self.district = district

    def label(self):
        return f"Station<{self.district}>"


class DispatchCenter(BaseStation):
    def __init__(self, district):
        super().__init__(district)
        self.active_routes = 3

    def assign_route(self, route_name):
        return f"{route_name}:{self.active_routes}"
