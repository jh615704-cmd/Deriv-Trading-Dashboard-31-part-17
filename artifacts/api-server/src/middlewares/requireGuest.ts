import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const COOKIE_NAME = "jdy_guest";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required");
  return value;
}

function sign(id: string) {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

function parseCookie(header: string | undefined) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return null;
}

function verify(value: string | null) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(id);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}

export const requireGuest: RequestHandler = (_req, res, next) => {
  try {
    const req = _req;
    let guestId = verify(parseCookie(req.headers.cookie));
    if (!guestId) {
      guestId = `guest_${randomUUID()}`;
      const value = `${guestId}.${sign(guestId)}`;
      res.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`,
      );
    }
    res.locals.userId = guestId;
    next();
  } catch (error) {
    next(error);
  }
};