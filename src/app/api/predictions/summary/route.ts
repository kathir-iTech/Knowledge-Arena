
import { NextResponse } from 'next/server';
import { getPredictionSummary } from '@/ai/engines/prediction-engine';

export async function GET() {
  try {
    const data = await getPredictionSummary();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
