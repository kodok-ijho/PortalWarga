import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mayar-signature, x-mayar-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const webhookSecret = Deno.env.get("MAYAR_WEBHOOK_SECRET");

    // Validasi token/secret webhook jika dikonfigurasi di environment
    if (webhookSecret) {
      const incomingToken = req.headers.get("x-mayar-token") || req.headers.get("x-mayar-signature");
      if (!incomingToken || incomingToken !== webhookSecret) {
        return new Response(
          JSON.stringify({ error: "Invalid or missing webhook signature/token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const payload = await req.json();
    const event = payload?.event || payload?.type || "payment.received";
    const data = payload?.data || payload;

    // Ambil identifier pembayaran
    const gatewayRef = data?.id || data?.payment_id || data?.payment_gateway_ref;
    const customMetadata = data?.metadata || {};
    const paymentId = customMetadata.payment_id || data?.internal_payment_id;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Cari payment record
    let targetPaymentId = paymentId;
    if (!targetPaymentId && gatewayRef) {
      const { data: found } = await adminClient
        .from("subscription_payments")
        .select("id")
        .eq("payment_gateway_ref", gatewayRef)
        .maybeSingle();

      targetPaymentId = found?.id;
    }

    if (!targetPaymentId) {
      return new Response(
        JSON.stringify({ error: "Record pembayaran tidak ditemukan untuk referensi ini" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Panggil fungsi database SECURITY DEFINER: activate_tenant_subscription
    const { data: result, error: rpcError } = await adminClient.rpc(
      "activate_tenant_subscription",
      {
        p_payment_id: targetPaymentId,
        p_gateway_ref: gatewayRef,
      }
    );

    if (rpcError) {
      throw new Error("RPC error: " + rpcError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Langganan tenant berhasil diaktifkan",
        activationResult: result,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[verify-subscription-payment] Error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
