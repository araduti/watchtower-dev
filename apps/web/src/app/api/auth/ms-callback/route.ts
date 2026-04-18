/**
 * Microsoft Azure AD admin consent callback handler.
 *
 * This route handles the redirect from Azure AD after an admin grants
 * consent for Watchtower's multi-tenant app registration. The flow:
 *
 *   1. User clicks "Authorize in Azure" on the tenant detail page
 *   2. User is redirected to Azure AD admin consent screen
 *   3. Admin grants consent on the customer's M365 tenant
 *   4. Azure redirects back to this callback with `admin_consent=True`
 *   5. This handler verifies the state parameter and redirects to
 *      the tenant detail page with a success/error query parameter
 *
 * NOTE: The actual credential storage (clientId + clientSecret) must
 * still be done manually via the SetCredentials dialog. The admin consent
 * flow only establishes the app registration permissions on the customer
 * tenant — it does not provide a client secret back to Watchtower.
 *
 * For a fully automated flow, the admin would:
 *   1. Grant consent here → establishes permissions
 *   2. Enter clientId + clientSecret in the dialog → stores credentials
 *
 * @see docs/Architecture.md — Trust boundaries
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Shape of the `state` parameter passed through the OAuth redirect.
 * Encoded as base64url JSON.
 */
interface ConsentState {
  tenantId: string;
  workspaceId: string;
}

/**
 * Parse and validate the state parameter from the OAuth callback.
 * Returns null if the state is missing or malformed.
 */
function parseState(stateParam: string | null): ConsentState | null {
  if (!stateParam) return null;

  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf-8");
    const parsed: unknown = JSON.parse(decoded);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("tenantId" in parsed) ||
      !("workspaceId" in parsed) ||
      typeof (parsed as Record<string, unknown>)["tenantId"] !== "string" ||
      typeof (parsed as Record<string, unknown>)["workspaceId"] !== "string"
    ) {
      return null;
    }

    return parsed as ConsentState;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  // Azure returns these query parameters on success:
  //   admin_consent=True&tenant=<azure-tenant-id>&state=<our-state>
  //
  // On error:
  //   error=<error_code>&error_description=<message>&state=<our-state>

  const state = parseState(searchParams.get("state"));
  const adminConsent = searchParams.get("admin_consent");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  // If state is missing or invalid, redirect to tenants list with error
  if (!state) {
    const redirectUrl = new URL("/dashboard/tenants", baseUrl);
    redirectUrl.searchParams.set("consent_error", "Invalid or missing state parameter.");
    return NextResponse.redirect(redirectUrl);
  }

  // Azure reported an error — redirect back with the error message
  if (error) {
    const redirectUrl = new URL(`/dashboard/tenants/${state.tenantId}`, baseUrl);
    redirectUrl.searchParams.set(
      "consent_error",
      errorDescription ?? `Azure consent failed: ${error}`,
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Consent was granted successfully
  if (adminConsent === "True") {
    const redirectUrl = new URL(`/dashboard/tenants/${state.tenantId}`, baseUrl);
    redirectUrl.searchParams.set("consent_granted", "true");
    return NextResponse.redirect(redirectUrl);
  }

  // Unexpected response — redirect with generic error
  const redirectUrl = new URL(`/dashboard/tenants/${state.tenantId}`, baseUrl);
  redirectUrl.searchParams.set("consent_error", "Unexpected response from Azure AD.");
  return NextResponse.redirect(redirectUrl);
}
