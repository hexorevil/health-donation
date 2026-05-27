import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    const systemCode = process.env.AZMOKI_ACCESS_CODE || process.env.NEXT_PUBLIC_ACCESS_CODE;

    // If no access code is configured on the server, allow any code (or just pass)
    if (!systemCode) {
      return Response.json({ success: true, message: "No server-side access code configured." });
    }

    if (code !== systemCode) {
      return Response.json({ success: false, error: "Invalid Access Code" }, { status: 401 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ success: false, error: "Bad Request" }, { status: 400 });
  }
}
