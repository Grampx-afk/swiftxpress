// SwiftXpress — Supabase Edge Function: verify-payment
// Verifies a Paystack payment reference server-side and marks the order as paid.
//
// Deploy with:
//   supabase functions deploy verify-payment
//
// Required environment variables (set in Supabase dashboard → Edge Functions → Secrets):
//   PAYSTACK_SECRET_KEY   — your Paystack secret key  (sk_live_xxx  or  sk_test_xxx)
//   SUPABASE_URL          — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase (gives admin DB access)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Parse request body
    const { reference, order_id } = await req.json();

    if (!reference || !order_id) {
      return new Response(
        JSON.stringify({ error: "Missing reference or order_id" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify with Paystack API
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) {
      console.error("PAYSTACK_SECRET_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
      }
    );

    const paystackData = await paystackRes.json();

    // 3. Check Paystack response
    if (!paystackData.status || paystackData.data?.status !== "success") {
      console.warn("Paystack verification failed:", paystackData);
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Payment not successful. Status: " + (paystackData.data?.status || "unknown"),
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const txAmount = paystackData.data.amount; // in kobo
    const expectedAmount = 70000; // ₦700 × 100 kobo

    // 4. Validate amount matches (prevents underpayment attacks)
    if (txAmount < expectedAmount) {
      console.warn(`Amount mismatch: got ${txAmount} kobo, expected ${expectedAmount} kobo`);
      return new Response(
        JSON.stringify({
          verified: false,
          error: `Amount paid (₦${txAmount / 100}) does not match delivery fee (₦700)`,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 5. Update order status in Supabase using service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: dbError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        paystack_ref: reference,          // store the reference for your records
      })
      .eq("id", order_id)
      .eq("status", "pending");           // only update if still pending (idempotency guard)

    if (dbError) {
      console.error("DB update error:", dbError);
      // Don't fail here — payment was real, just log it. Admin can fix manually.
      // Still return verified:true so the customer isn't stuck.
      console.warn("Payment verified but DB update failed. Manual fix needed for order:", order_id);
    }

    // 6. Return success
    return new Response(
      JSON.stringify({
        verified: true,
        reference: reference,
        amount: txAmount / 100,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
