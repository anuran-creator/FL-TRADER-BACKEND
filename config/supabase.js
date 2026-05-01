import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mtyghphhysaodngqahsu.supabase.co',
  'sb_publishable_M_gr_603GYwukqeKja8akg_VD_GRvuC'
)

console.log("✅ Supabase connected");



export default supabase

