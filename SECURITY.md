# Security Policy

## Supported version

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting flow under **Security → Report a vulnerability**. Do not open a public issue containing API keys, cookies, database records, private R2 URLs, personal data, or reproducible exploit details.

Include the affected version, impact, minimal reproduction, and any suggested mitigation. Please allow reasonable time for validation and remediation before public disclosure.

## Secret handling

MiMo credentials, R2 keys, SMTP credentials, authentication secrets, encryption keys, production `.env` files, database dumps, signed media URLs, and generated user audio must never be committed to the repository.

If a secret reaches Git history, rotate it first. Removing it from the latest tree is not sufficient; rewrite the affected history before making the repository public.
