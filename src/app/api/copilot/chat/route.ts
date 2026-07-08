
import { NextResponse } from 'next/server';
import { handleCopilotChat } from '@/ai/engines/copilot-engine';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });
    const response = await handleCopilotChat(message);
    return NextResponse.json({ response });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
