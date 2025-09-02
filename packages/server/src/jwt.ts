import jwt from "jsonwebtoken";

// ----------------- JWT helpers -----------------
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export function createJwt(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

export function verifyJwt(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Parse cookies from header
export function parseCookie(cookieHeader?: string) {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const pair of cookieHeader.split(";")) {
    const [key, value] = pair.split("=").map((v) => v.trim());
    result[key] = value;
  }
  return result;
}