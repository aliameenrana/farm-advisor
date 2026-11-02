export interface Env {
  DB: D1Database;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_APP_SECRET: string;
  GROQ_API_KEY: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  // Salt for hashing phone numbers so the log never holds a raw number.
  TESTER_SALT: string;
  OFFICER_PHONE: string;
  TTS_PROVIDER?: string;
  GEMINI_TTS_MODEL?: string;
  GEMINI_TTS_VOICE?: string;
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  // Whisper avg_logprob below this is treated as "didn't understand".
  MIN_CONFIDENCE?: string;
  ANSWER_MODEL?: string;
}
