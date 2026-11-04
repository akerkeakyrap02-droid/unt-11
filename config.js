// Paste your Supabase project values here (Project Settings -> API).
// The anon key is meant to be public: Row Level Security protects the data.
// NEVER put the service_role key in this file.
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// Students without an email sign up with a username. Behind the scenes it becomes
// username@<this domain>. No email is ever sent to it (turn off "Confirm email" in Supabase).
export const USERNAME_EMAIL_DOMAIN = "students.englishtestprep.app";
