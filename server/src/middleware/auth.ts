import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type Session } from "../lib/auth.ts";
import { HttpError } from "./error.ts";

declare global {
  namespace Express {
    interface Request {
      user?: Session["user"];
      session?: Session["session"];
    }
  }
}

// Looks up the session cookie in the database; 401 if missing or expired.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!result) throw new HttpError(401, "Unauthorized");
  req.user = result.user;
  req.session = result.session;
  next();
};

// Allows only admins. Must run after requireAuth, which sets req.user.
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  next();
};
