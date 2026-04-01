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
    let feeStr: string | null | undefined = order.fee;
    let expectedNaira = 0;

    // Log the current state for debugging
    console.log(`[v2.2] Processing Order ID: ${order_id}. Initial fee from DB: "${feeStr}"`);

    // FALLBACK: If order fee is missing or placeholder, check the 'settings' table
    if (!feeStr || (typeof feeStr === 'string' && (feeStr === "₦..." || feeStr.trim() === ""))) {
      console.warn(`[v2.2] Order fee missing for order: ${order_id}. Fetching live default...`);
      const { data: setting, error: settingsError } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "delivery_fee")
        .single();
      
      if (!settingsError && setting) {
        feeStr = setting.value;
        console.log(`[v2.2] Using fallback fee from settings: "${feeStr}"`);
      }
    }

    // Handle "Via WhatsApp" or other non-numeric statuses
    const currentFee = typeof feeStr === 'string' ? feeStr.toLowerCase() : "";
    if (currentFee.includes("whatsapp")) {
      console.warn(`[v2.2] Order ${order_id} is a WhatsApp delivery. Automatic payment not possible.`);
      return new Response(JSON.stringify({ 
        error: "[v2.2] This order requires custom pricing via WhatsApp. Please contact support." 
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (typeof feeStr === 'string') {
      // Extract only digits from the fee string
      const cleanFee = feeStr.replace(/[^0-9]/g, "");
      expectedNaira = parseInt(cleanFee, 10);
    }

    if (!expectedNaira || expectedNaira <= 0) {
      console.error(`[v2.2] CRITICAL ERROR: Could not parse fee for order: ${order_id}. Raw value: "${feeStr}"`);
      return new Response(JSON.stringify({ 
        error: "[v2.2] ERROR: Order fee could not be determined. Please contact support." 
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const expectedKobo = expectedNaira * 100;

    // 5. Verify with Paystack API
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) {
      console.error("[v2.2] CONFIG ERROR: PAYSTACK_SECRET_KEY is not set in Supabase Secrets.");
      return new Response(
        JSON.stringify({ error: "[v2.2] ERROR: Shared payment secret not configured." }),
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
      console.warn(`[v2.2] Paystack verification failed for Ref: ${reference}.`, paystackData);
      return new Response(
        JSON.stringify({
          verified: false,
          error: "[v2.2] Payment not successful. Status: " + (paystackData.data?.status || "unknown"),
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const txAmount = paystackData.data.amount; // in kobo

    // 7. Validate the paid amount matches the order's actual total (prevents underpayment attacks)
    if (txAmount < expectedKobo) {
      const paidNaira = txAmount / 100;
      console.warn(`[v2.2] AMOUNT MISMATCH for Order ${order_id}: Paid ₦${paidNaira}, Expected ₦${expectedNaira}`);
      return new Response(
        JSON.stringify({
          verified: false,
          error: `[v2.2] Paid amount (₦${paidNaira}) is less than total required (₦${expectedNaira}).`,
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
