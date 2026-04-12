#!/bin/bash
# SwiftXpress — Vercel Build Script

echo "Injecting environment variables into config.js..."

sed -i "s|%%SUPABASE_URL%%|${SUPABASE_URL}|g" config.js
sed -i "s|%%SUPABASE_ANON_KEY%%|${SUPABASE_ANON_KEY}|g" config.js
sed -i "s|%%WA_NUMBER%%|${WA_NUMBER}|g" config.js
sed -i "s|%%PAYSTACK_PUBLIC_KEY%%|${PAYSTACK_PUBLIC_KEY}|g" config.js

echo "Done! config.js updated."
