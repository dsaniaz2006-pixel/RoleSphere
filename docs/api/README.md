# API documentation

The current route inventory and registration rules are maintained in [HTTP/API layout](../architecture/API.md).

RoleSphere currently exposes established unversioned endpoints (including legacy paths used by EJS dashboards and browser scripts). These are the compatibility contract. A future `/api/v1` surface must be introduced as an additive router that delegates to the same controllers/services, with contract tests proving that existing paths remain available. Do not mount aliases until all relevant route ordering, auth policies, and response schemas have been tested.
