import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('Supabase-omgevingsvariabelen ontbreken. Kopieer .env.example naar .env en vul ze in.')
}

export const supabase = createClient(url, key)
