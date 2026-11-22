# Repository layer policy

RoleSphere currently uses Mongoose models directly in a number of focused services and legacy route modules. Do not add a generic repository wrapper around every model: that would duplicate Mongoose without creating a useful boundary.

Create a repository module when at least one of these conditions is true:

- The same query/aggregation is reused by multiple services or controllers.
- A persistence operation has non-trivial transaction, locking, or consistency rules.
- A feature needs a stable data-access boundary to support isolated unit tests.
- A domain query must be shared across MongoDB implementations or external data sources.

Repository modules should return domain data and must not depend on Express `req`/`res`, EJS, or Socket.IO. Services own business rules; controllers own HTTP translation. Add repository tests and preserve Mongoose query scoping/authorization constraints when extracting code.
