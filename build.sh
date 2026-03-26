#!/bin/bash
# SwiftXpress — Vercel Build Script
# Replaces placeholders in config.js with actual environment variables

echo "Injecting environment variables into config.js..."

sed -i "s|%%SUPABASE_URL%%|${SUPABASE_URL}|g" config.js
sed -i "s|%%SUPABASE_ANON_KEY%%|${SUPABASE_ANON_KEY}|g" config.js

echo "Done! config.js updated."
