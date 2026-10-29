// App name and the private sign-in address. Change the name here only.
export const APP_NAME = "Talent Hub";
export const APP_SHORT = "H";
// The sign-in page lives at this long, hard-to-guess address (set VITE_LOGIN_PATH on Vercel to change it).
// Every other address shows "Page not found" to people who are not signed in.
export const LOGIN_PATH = "/" + String(import.meta.env.VITE_LOGIN_PATH || "zv-admin-access-7k2m9q4x").replace(/^\/+/, "");
