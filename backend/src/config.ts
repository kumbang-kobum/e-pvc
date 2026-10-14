import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Env ${name} wajib diisi`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3100),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  databaseUrl: required("DATABASE_URL"),
};
