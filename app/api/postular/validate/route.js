import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  try {
    const response = await fetch(`https://email-checker.p.rapidapi.com/verify/v1?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': 'a590fb5213mshd544485a6c0cc07p1d9003jsn65c106bbe7ea',
        'X-RapidAPI-Host': 'email-checker.p.rapidapi.com'
      }
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}