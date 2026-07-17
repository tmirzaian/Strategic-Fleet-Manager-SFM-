# Security Policy

## Reporting a Vulnerability

Strategic Fleet Manager does not yet have a dedicated security contact
email or private disclosure channel. Because of that, please **do not**
post exploit details, proof-of-concept code, or other sensitive technical
information in a normal public GitHub Issue.

Instead:

1. Open a new [GitHub Issue](../../issues) with a minimal description —
   something like "Security concern — requesting private contact," with no
   technical details, reproduction steps, or affected code included.
2. We'll follow up on that Issue to arrange a private channel to discuss
   the details.

This process will be replaced with a proper security contact (email or
private disclosure form) once one is established. Thank you for reporting
responsibly in the meantime.

## Scope

Strategic Fleet Manager is a local-first, browser-based application with
no backend server and no account system during Beta. Most security
considerations relevant to a typical web service (authentication, server
compromise, data breaches) don't currently apply. Relevant concerns include
things like cross-site scripting, dependency vulnerabilities, or unsafe
handling of external data (e.g. imported ship data or images).
