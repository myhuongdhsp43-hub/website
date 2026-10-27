declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DEFAULT_SCHOOL_NAME?: string;
    DEV_MODE?: string;
    SMS_PROVIDER?: string;
    SMS_API_KEY?: string;
    SMS_SECRET?: string;
    SMS_SENDER?: string;
    ADMIN_USERNAME?: string;
    ADMIN_INITIAL_PASSWORD?: string;
  }
}
