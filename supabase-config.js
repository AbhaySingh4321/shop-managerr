const SUPABASE_URL = 'https://mqolezpxftkunihxujow.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xb2xlenB4ZnRrdW5paHh1am93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1OTUyMzMsImV4cCI6MjA3ODE3MTIzM30.wCXp80WLRDQo41-tZpf_v5SvHFUQIMnJejpoT5R6xcU';
window.addEventListener('load', () => {
  const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabase = supabase; // assign globally
});
