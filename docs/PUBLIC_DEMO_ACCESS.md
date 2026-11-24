# RoleSphere public demo access

RoleSphere's public demo uses four shared, read-only sample accounts. The demo records live in the existing `EmployeeManage` database but are marked with a dedicated `demoKey`. Demo requests are automatically scoped to that marker.

## Demo credentials

| Role | Email |
| --- | --- |
| Admin | `admin@rolesphere.demo` |
| HR | `hr1@rolesphere.demo` |
| Manager | `manager1@rolesphere.demo` |
| Employee | `employee1@rolesphere.demo` |

Shared password: `RoleSphereDemo@2026!`

The login page displays the credential for the selected role and offers a fill button when `DEMO_MODE=true`.

## Safe seeding into the existing database

1. Back up the `EmployeeManage` database before changing production data.
2. Confirm that your local `.env` still contains the existing Atlas `MONGO_URI` ending in `/EmployeeManage`. Do not replace it with another database name.
3. From the project root, run this explicit one-time command:

   ```bash
   DEMO_MODE=true DEMO_SEED_CONFIRM=I_UNDERSTAND_DEMO_DATA_IN_EMPLOYEEMANAGE npm run seed:demo
   ```

4. The script refuses to run unless the URI database name is exactly `EmployeeManage`, `DEMO_MODE=true`, and the confirmation value matches. It also refuses to reuse any reserved demo email if it already belongs to an unmarked/non-demo account.
5. The seeder only upserts records carrying the dedicated demo marker. It never calls collection-wide `deleteMany`, never resets existing employee data, and can be run repeatedly.

The script does not edit `MONGO_URI`, and it does not run automatically at server start.

## Enable demo access on Render

After the seed completes successfully:

1. Open Render → RoleSphere → Environment.
2. Add `DEMO_MODE=true`.
3. Do not add `DEMO_SEED_CONFIRM` to Render. It is only for the one-time local seed command.
4. Save and deploy.

Keep the existing Render `MONGO_URI` exactly as it is: it must continue to point to `EmployeeManage`.

## Data isolation and limits

- Demo account login is rejected unless `DEMO_MODE=true`.
- Demo HTTP reads are filtered by `demoKey` for Mongoose find/count/distinct/aggregate queries. Normal accounts are filtered to unmarked real records, so they do not see demo users or sample activity. The HR route's legacy direct employee count and edit query are scoped explicitly as well.
- The four demo accounts are read-only. State-changing POST/PUT/PATCH/DELETE requests and legacy state-changing GET paths are rejected; only known read-only POST list endpoints are allowed. Regular accounts also cannot modify marked demo records through Mongoose query updates.
- Demo accounts cannot read files from the production uploads directory and are disconnected from live Socket.IO broadcasts.
- Normal accounts continue using the existing organization-wide behavior.
- The demo login page exposes the shared credentials only while demo mode is enabled.

If a reserved demo email is already in use by a real account, stop and choose a different demo email after inspecting the conflict. Do not remove or rename the real account to make the seed succeed.
