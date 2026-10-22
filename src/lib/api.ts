import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionContext, type SessionContext } from "@/lib/auth/session";

/** Typed API error carrying an HTTP status and optional field-level details. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data as object, { status });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details !== undefined ? { details } : {}) },
    { status },
  );
}

/**
 * Require an authenticated driver. Throws `ApiError(401)` when signed out so
 * route handlers can stay linear.
 */
export async function requireDriver(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new ApiError(401, "You need to sign in to do that.");
  return ctx;
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ApiError(400, "Some fields need attention.", issues);
  }
  return result.data;
}

/** Uniform error handling for route handlers. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.status, err.message, err.details);
    }
    if (err instanceof ZodError) {
      return fail(400, "Invalid input.");
    }
    console.error("[dashintel] unhandled API error:", err);
    return fail(500, "Something went wrong on our side.");
  }
}

export function parseJsonBody(request: Request): Promise<unknown> {
  return request
    .json()
    .catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    }) as Promise<unknown>;
}
