
import { NextResponse } from 'next/server';
import { handleCopilotChat } from '@/ai/engines/copilot-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';

export async function POST(req: Request) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });
    const response = await handleCopilotChat(message);
    return NextResponse.json({ response });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
