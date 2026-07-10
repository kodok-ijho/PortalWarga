# Operational Backup and Observability Procedures

This document outlines the backup, recovery, and observability guidelines for the production environment of the **Portal Warga Palm Village** application.

---

## 1. Supabase Database Backup Strategy

Supabase runs on AWS/GCP (managed PostgreSQL). To ensure zero data loss, the following backup mechanisms are configured:

### 1.1 Automated Backups
- **Daily Logical Backups:** Managed automatically by Supabase for Pro projects. Backups are retained for 7 days (or longer depending on subscription).
- **Point-in-Time Recovery (PITR):** Enables WAL-based database recovery to any specific second in the past (up to 30 days retention). Recommended for production database hardening.

### 1.2 Manual Database Exports (pg_dump)
To perform a local/custom logical backup of the database schema and public data:
```bash
# Export the entire database (schema and data)
pg_dump -h db.mzjgliclzihrdjaqzmqg.supabase.co -U postgres -d postgres -F p -f supabase_backup.sql
```
*Note: Run this command in a secure admin shell. It will prompt for your Supabase database password.*

---

## 2. n8n Workflow Backup and Sync Plan

To keep n8n workflows version-controlled and recoverable, follow these export procedures.

### 2.1 Bulk Export via n8n CLI
If accessing the server directly via SSH:
```bash
# Export all active workflows to a local folder
n8n export:workflow --all --output=/path/to/backup/workflows/

# Export all active credentials (metadata only)
n8n export:credentials --all --output=/path/to/backup/credentials/
```

### 2.2 Export via public REST API
We can use a script (similar to our deployment scripts) to fetch and save all workflow definitions using the public API:
```bash
# Fetch and backup specific workflow
curl -H "X-N8N-API-KEY: YOUR_API_KEY" https://n8n-icyxwmjq.runner.web.id/api/v1/workflows/wy5Nag3gobckcqxd > billing_reminder.json
```

---

## 3. n8n Credentials Recovery Plan

Credentials values (passwords, tokens, service keys) are encrypted in n8n's database. 

### 3.1 Key Credentials Inventory
For recovery, keep the values of these active credentials in a secure Password Manager:
1. **PV Supabase Service Role Key:** Service role key for database queries bypassing RLS.
2. **PV App JWT:** The symmetric secret key (HS256) used to sign/verify citizen sessions.
3. **PV Midtrans Sandbox Key:** Basic authorization base64 key for Midtrans Snap API.
4. **SMTP account:** Host, port, username, and password for no-reply notifications.
5. **WAHA account:** Token/URL for the WhatsApp gateway node.

### 3.2 Recovery Process
When restoring workflows to a clean instance:
1. Import all JSON files in the `/n8n-workflows` folder.
2. Go to n8n UI -> Credentials.
3. Create new credentials with the exact matching names listed above (e.g. `PV Supabase Service Role`, `PV App JWT`, etc.).
4. Enter the stored production secrets.

---

## 4. Error Observability and Monitoring

### 4.1 Audit Logs Table
Every critical financial and authentication action writes a row to the `audit_logs` table in Supabase. Check this table for systematic tracking of:
- `payment.proof_uploaded`
- `payment.verified`
- `billing.late_fee_applied`
- `auth.login`

### 4.2 n8n Execution History
- Every active webhook (such as `/payments/midtrans/webhook`) has `Save Successful Executions` and `Save Failed Executions` toggled on.
- Check the n8n execution panel to inspect input payloads, signature check results, and HTTP request timings.
- For scheduled jobs (`PV Schedule - Bill Reminder`), the history log contains detailed counts of notified citizens.
