
import { NextResponse } from 'next/server';
import { getPredictionSummary } from '@/ai/engines/prediction-engine';
import { verifyFirebaseToken } from '@/lib/verify-auth';

export async function GET(req: Request) {
  try {
    const auth = await verifyFirebaseToken(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const data = await getPredictionSummary();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
