import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mzjgliclzihrdjaqzmqg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16amdsaWNsemlocmRqYXF6bXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MzcyMTcsImV4cCI6MjA5OTAxMzIxN30.XWUEM2QSP0ifOifcLV5WavegyNTxcjqvRWY7Re7ll6I';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

(async () => {
  console.log('🔍 Testing Supabase direct query for Unit 13 / Sep 2026...');

  try {
    const { data: bills, error: billErr } = await supabase
      .from('ipl_bills')
      .select('*')
      .eq('unit_id', 13)
      .eq('period', '2026-09');

    console.log('📄 Bills:', bills, billErr);

    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('ipl_bill_id', bills?.[0]?.id || 'none');

    console.log('💳 Payments by Bill ID:', payments, payErr);

    const { data: allPayments, error: allPayErr } = await supabase
      .from('payments')
      .select('*')
      .limit(5);

    console.log('💳 All Payments Sample:', allPayments, allPayErr);
  } catch (err) {
    console.error('❌ Supabase Error:', err);
  }
})();
