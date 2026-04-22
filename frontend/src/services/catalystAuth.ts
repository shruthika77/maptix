/**
 * Zoho Catalyst Authentication Helper for Frontend.
 *
 * Dual-mode authentication:
 *   - AUTH_MODE=jwt (default): Standard email/password -> JWT token flow
 *   - AUTH_MODE=catalyst: Calls same /v1/auth/* endpoints, but the backend
 *     routes to Catalyst REST API instead of local bcrypt+JWT
 *
 * The frontend API calls are IDENTICAL in both modes. The only difference
 * is what the backend does internally. This means:
 *   - Same login/register forms
 *   - Same token storage (zustand + localStorage)
 *   - Same Authorization: Bearer <token> header
 *
 * Set NEXT_PUBLIC_AUTH_MODE=catalyst in .env.local to switch modes.
 */

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "jwt";
export const CATALYST_PROJECT_ID =
  process.env.NEXT_PUBLIC_CATALYST_PROJECT_ID || "";

/**
 * Check if we are using Catalyst authentication mode.
 */
export function isCatalystAuth(): boolean {
  return AUTH_MODE === "catalyst";
}

/**
 * Fetch the backend auth configuration.
 * Returns which provider is active and which features are available.
 */
export async function fetchAuthConfig(): Promise<{
  auth_provider: string;
  catalyst_project_id: string;
  features: {
    register: boolean;
    login: boolean;
    forgot_password: boolean;
    social_login: boolean;
  };
}> {
  const res = await fetch("/v1/auth/config");
  if (!res.ok) {
    return {
      auth_provider: "jwt",
      catalyst_project_id: "",
      features: {
        register: true,
        login: true,
        forgot_password: false,
        social_login: false,
      },
    };
  }
  return res.json();
}

/**
 * Request a password reset (only works in catalyst mode).
 */
export async function requestPasswordReset(
  email: string
): Promise<{ message: string }> {
  const res = await fetch("/v1/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(data.detail || "Password reset failed");
  }
  return res.json();
}
