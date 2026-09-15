-- Migration: Implement draw_arisan_winner atomic RPC
-- Task: T8.5 (Ref: requirement.md FR-18, specification.md §5)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- FUNGSI ATOMIK: draw_arisan_winner
-- 1. Validasi subscription gate bukan read_only
-- 2. Kunci baris putaran (SELECT FOR UPDATE)
-- 3. Validasi seluruh tagihan putaran lunas (status = 'paid')
-- 4. Filter kandidat peserta dengan has_won = false
-- 5. Pilih acak kandidat pemenang (ORDER BY random() LIMIT 1)
-- 6. Catat pemenang pada arisan_rounds dan arisan_participants
-- ============================================================

CREATE OR REPLACE FUNCTION public.draw_arisan_winner(
  p_tenant_id uuid,
  p_round_id uuid,
  p_operator_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_unpaid_count integer := 0;
  v_total_bills integer := 0;
  v_candidate record;
  v_total_remaining_candidates integer := 0;
BEGIN
  -- 1. Validasi subscription status
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk melakukan pengocokan.';
  END IF;

  -- 2. Kunci dan validasi putaran arisan
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Putaran arisan dengan ID % tidak ditemukan pada tenant ini.', p_round_id;
  END IF;

  IF v_round.status = 'drawn' THEN
    RAISE EXCEPTION 'Putaran ini sudah pernah dikocok dan pemenang telah ditetapkan.';
  END IF;

  IF v_round.status = 'cancelled' THEN
    RAISE EXCEPTION 'Putaran ini berstatus dibatalkan dan tidak dapat dikocok.';
  END IF;

  -- 3. Validasi Pelunasan Iuran Peserta
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status != 'paid')
  INTO v_total_bills, v_unpaid_count
  FROM public.billing_items
  WHERE tenant_id = p_tenant_id
    AND (
      (metadata->>'round_id') = p_round_id::text
      OR period = v_round.period
    );

  IF v_total_bills = 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Tagihan iuran untuk putaran ini belum diterbitkan.';
  END IF;

  IF v_unpaid_count > 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Masih terdapat % peserta yang belum melunasi iuran pada putaran ini.', v_unpaid_count;
  END IF;

  -- 4. Pilih kandidat pemenang yang belum pernah menang (has_won = false)
  SELECT 
    ap.id AS participant_id,
    ap.member_id,
    tm.full_name AS member_name,
    tm.phone AS member_phone,
    tu.label AS slot_label
  INTO v_candidate
  FROM public.arisan_participants ap
  JOIN public.tenant_members tm ON tm.id = ap.member_id
  LEFT JOIN public.tenant_units tu ON tu.id = ap.unit_slot_id
  WHERE ap.tenant_id = p_tenant_id
    AND ap.has_won = false
    AND tm.status = 'approved'
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semua peserta arisan telah memenangkan undian pada siklus ini. Silakan lakukan aksi "Mulai Siklus Baru".';
  END IF;

  -- 5. Catat pemenang pada putaran arisan
  UPDATE public.arisan_rounds
  SET status = 'drawn',
      winner_member_id = v_candidate.member_id,
      drawn_at = now(),
      drawn_by = p_operator_member_id,
      updated_at = now()
  WHERE id = p_round_id;

  -- 6. Tandai peserta telah menang pada tabel arisan_participants
  UPDATE public.arisan_participants
  SET has_won = true,
      won_at_round_id = p_round_id,
      won_at = now(),
      updated_at = now()
  WHERE id = v_candidate.participant_id;

  -- Hitung sisa kandidat yang belum menang
  SELECT COUNT(*) INTO v_total_remaining_candidates
  FROM public.arisan_participants
  WHERE tenant_id = p_tenant_id AND has_won = false;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'round_number', v_round.round_number,
    'period', v_round.period,
    'winner_member_id', v_candidate.member_id,
    'winner_name', v_candidate.member_name,
    'winner_phone', v_candidate.member_phone,
    'slot_label', v_candidate.slot_label,
    'drawn_at', now(),
    'total_prize', v_round.total_pool_amount,
    'remaining_candidates', v_total_remaining_candidates,
    'is_cycle_completed', (v_total_remaining_candidates = 0)
  );
END;
$$;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.draw_arisan_winner(uuid, uuid, uuid);
