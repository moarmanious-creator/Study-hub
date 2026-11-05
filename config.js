// Student Hub — settings for your Supabase project.
// Supabase → Project Settings → API: copy the Project URL and the "anon public" key.
// The anon key is safe to publish; the database rules decide what each user can see.
// Never put the service_role key here.
window.MLEA_CONFIG = {
  SUPABASE_URL: "https://xuczrclkracapdeybsoh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y3pyY2xrcmFjYXBkZXlic29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjMwMjYsImV4cCI6MjEwOTAzOTAyNn0.tLXaTgimlCsUyeTgbmlfjXfDnMFC1H6ovqrXSIRyGAo",
  // Public address of the app; sign-up and password emails link here.
  SITE_URL: "https://moarmanious-creator.github.io/Study-hub/",
  // AI study assistant: leave false until the "ai" function is deployed (see README).
  AI_ENABLED: false,
  // Which roles see the assistant. Add "student" to open it to everyone.
  AI_ROLES: ["admin"],
  // ── Student Hub ──
  // The Hub's assistant shows a "switched off" note when this is false.
  HUB_AI_ENABLED: true,
  // Public address of the Hub; invitation and password-reset emails link here.
  HUB_SITE_URL: "https://moarmanious-creator.github.io/Study-hub/"
};
