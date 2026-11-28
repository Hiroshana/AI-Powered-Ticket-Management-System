import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.path });
};

// Express 5 forwards rejected promises from async handlers here automatically.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // body-parser errors (malformed JSON, 413 too large) carry `status` and `expose`.
  const status =
    err instanceof HttpError
      ? err.status
      : err?.expose && typeof err.status === "number"
        ? err.status
        : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err.message,
  });
};
