import { NextRequest, NextResponse } from "next/server";
import { signInWithPassword, completeOtp, tokenStatus } from "@/lib/sorare/auth";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withErrorHandling(async () => {
  return NextResponse.json(await tokenStatus());
});

/**
 * Two-step sign-in, driven entirely from the app so 2FA no longer means
 * editing SORARE_OTP in Vercel and redeploying while a 6-digit code ticks
 * down. Send email+password first; if the response says otp_required, send
 * the returned challenge back with the code.
 *
 * The password is used to derive the hash for this one request and is never
 * stored — only the resulting JWT is persisted (TokenCache), for ~30 days.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) throw new ApiError("Requête invalide.");

  // Credential problems come back as 401 with Sorare's own wording rather than
  // a generic 500, without a catch here: SorareAuthError is an ApiError
  // carrying that status, and withErrorHandling renders it.
  if (body.challenge) {
    const otp = String(body.otp ?? "").trim();
    if (!otp) throw new ApiError("Code à 6 chiffres requis.");
    return NextResponse.json(await completeOtp(String(body.challenge), otp));
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email || !password) throw new ApiError("Email et mot de passe requis.");

  return NextResponse.json(await signInWithPassword(email, password));
});
