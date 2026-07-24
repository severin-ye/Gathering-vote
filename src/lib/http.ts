import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "请求格式错误");
  }
  return parsed.data;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const databaseError = error as { code?: string; message?: string };
  if (
    databaseError.code === "23505" ||
    databaseError.message?.toLocaleLowerCase().includes("unique")
  ) {
    return NextResponse.json({ error: "名称已经存在" }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "服务器暂时无法处理请求" }, { status: 500 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new HttpError(403, "请求来源无效");
  }
}

const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(request: Request, key: string, limit = 30, windowMs = 60_000) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const mapKey = `${key}:${ip}`;
  const existing = attempts.get(mapKey);
  if (!existing || existing.resetAt <= now) {
    attempts.set(mapKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) throw new HttpError(429, "操作过于频繁，请稍后再试");
}
