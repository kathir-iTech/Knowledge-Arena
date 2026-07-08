
import { NextResponse } from 'next/server';
import { getDecisionSupportSummary } from '@/ai/engines/decision-support-engine';

export async function GET() {
  try {
    const data = await getDecisionSupportSummary();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
