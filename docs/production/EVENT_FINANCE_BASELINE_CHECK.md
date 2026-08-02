# Event Finance Baseline Check

> Date: 2026-08-01
>
> Scope: EVT-008 verification of migration compatibility and baseline preservation.

## Result

The live Supabase project currently still matches the pre-event baseline for finance tables:

- `events` does not yet have the additive event finance columns from the local migration.
- `expenses` does not yet have `scope`, `event_id`, `deleted_at`, or `deleted_by`.
- `event_members` and `non_ipl_incomes` are not present yet.
- Existing IPL tables, profiles, payments, audit logs, and forum tables remain intact.

That means the local migration file is additive and has not been applied remotely in this project.

## Baseline Snapshot

- `profiles`: 7 rows
- `units`: 53 rows
- `ipl_bills`: 1908 rows
- `payments`: 49 rows
- `expenses`: 0 rows
- `audit_logs`: 174 rows
- `events`: 0 rows

## Advisory Notes

Current Supabase advisor output highlights existing project-level concerns unrelated to the event migration itself:

- `public.ipl_components` and `public.ipl_settings` have RLS enabled without policies.
- Several `SECURITY DEFINER` RPC functions are callable by `anon` and/or `authenticated`.
- Several foreign keys lack covering indexes.
- Some indexes are currently unused.

These are existing project observations, not caused by the event finance migration artifact.

## Compatibility Conclusion

The event finance migration is structurally additive and does not rewrite IPL/payment tables.
No live baseline data changed during this verification step.

## Follow-up

Proceed to EVT-009 only after the production/staging n8n workflow source is created for the event API routes.
