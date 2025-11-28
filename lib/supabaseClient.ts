// lib/supabaseClient.ts

// @ts-ignore
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://yuawxjypxfkwfcmalhbg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXd4anlweGZrd2ZjbWFsaGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMDY2NzAsImV4cCI6MjA3OTY4MjY3MH0.85j7eV-8o4JIPSPxjkGdMNAA2ff-f5x4CpI9SzZkLxM',
);
