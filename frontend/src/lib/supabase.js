import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vogbbwijpupxrnmnmfjp.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvZ2Jid2lqcHVweHJubW5tZmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0MTU5MTcsImV4cCI6MjA2Mjk5MTkxN30.MNRM_zg40_fkUjLO1ZAR7CT_H_8frSjobkdONKGRTQo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

