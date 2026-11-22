# RoleSphere documentation

Read [the project README](../README.md) first. Folder names reflect responsibility; runtime code stays separate from documentation.

## Setup
- [Local HTTPS and getting started](setup/START_HERE_HTTPS.md)
- [Google OAuth setup](setup/GOOGLE_LOGIN.md)
- [HTTPS and deployment](setup/HTTPS_SETUP_AND_DEPLOY.md)
- [Google login troubleshooting](setup/START_HERE_GOOGLE_FIX.md)
- [Environment variable reference](setup/ENVIRONMENT_REFERENCE.md)
- [Applying the older Google patch](setup/APPLY_GOOGLE_LOGIN_UPGRADE.md) (historical procedure)

## Architecture
- [Codebase structure and boundaries](architecture/CODEBASE.md)
- [Refactoring decisions and remaining debt](architecture/REFACTORING.md)
- [API route map and versioning plan](architecture/API.md)
- [Central error handling](architecture/ERROR_HANDLING.md)
- [Client-side state management](architecture/STATE.md)
- [API documentation index](api/README.md)

## Features
- [Workspace](features/COMPONENT_WORKSPACE.md)
- [Authentication UI](features/GLASS_AUTH.md)
- [Dashboard components](features/DASHBOARD_BACKGROUND.md)
- [Dashboard and recovery](features/RECOVERY_AND_DASHBOARD.md)
- [Landing page](features/LANDING_PAGE.md)
- [Premium UI](features/PREMIUM_UI.md)

## Testing and audit
- [Architecture refactor verification and remaining gates](testing/ARCHITECTURE_REFACTOR_2026-11-22.md)
- [Earlier refactor verification](testing/REFACTOR_VALIDATION_2026-11-14.md)
- [Test instructions and limits](testing/VERIFICATION.md)
- [Predeployment audit](testing/PREDEPLOY_TEST_REPORT.md)
- [HTTPS test report](testing/HTTPS_IMPLEMENTATION_TEST_REPORT.md)
- [Session regression](testing/SESSION_COOKIE_REGRESSION_FIX.md)
- [Component verification](testing/COMPONENT_VERIFICATION.md)

## Archives
Earlier standalone guides are under [history](history/). These may describe older folder names or transitional work.
