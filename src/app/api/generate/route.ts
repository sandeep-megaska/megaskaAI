import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    console.log("DEBUG: API Route hit"); // This will show in Vercel Logs
    
    const body = await req.json();
    console.log("DEBUG: Request Body received:", body);

    // ... Your existing generation logic here ...

    return NextResponse.json({ success: true, message: "Generation started" });
  } catch (error) {
    console.error("GENERATION_ERROR:", error); // This is the most important line
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}