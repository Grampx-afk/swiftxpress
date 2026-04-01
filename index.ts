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

    // 2. Set up Supabase client (service role — bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 3. Fetch the order from DB to get the actual expected fee
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, fee, status")
      .eq("id", order_id)
      .single();

    if (fetchError || !order) {
      console.error("Order fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 4. Parse the expected amount from the fee field (e.g. "₦1400" → 1400)
    // The fee field stores values like "₦700", "₦1400", "Via WhatsApp", etc.
    const feeStr = order.fee;
    if (!feeStr) {
      console.error("Order fee is missing for order:", order_id);
      return new Response(JSON.stringify({ error: "Order fee is not set" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const parsedFee = parseInt(feeStr.replace(/[^0-9]/g, ""), 10);
    if (isNaN(parsedFee) || parsedFee <= 0) {
      console.error("Invalid fee amount for order:", order_id, "Fee:", feeStr);
      return new Response(JSON.stringify({ error: "Order fee is invalid or not a fixed amount" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const expectedNaira = parsedFee;
    const expectedKobo = expectedNaira * 100;

    // 5. Verify with Paystack API
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

    // 6. Check Paystack response status
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

    // 7. Validate the paid amount matches the order's actual total (prevents underpayment attacks)
    if (txAmount < expectedKobo) {
      console.warn(`Amount mismatch: got ${txAmount} kobo, expected ${expectedKobo} kobo`);
      return new Response(
        JSON.stringify({
          verified: false,
          error: `Amount paid (₦${txAmount / 100}) does not match order total (₦${expectedNaira})`,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 8. Update order status in Supabase
    const { error: dbError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        paystack_ref: reference,
      })
      .eq("id", order_id)
      .eq("status", "pending"); // idempotency guard — only update if still pending

    if (dbError) {
      console.error("DB update error:", dbError);
      // Payment was real — don't fail the customer. Log for manual fix.
      console.warn("Payment verified but DB update failed. Manual fix needed for order:", order_id);
    }

    // 9. Return success
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
