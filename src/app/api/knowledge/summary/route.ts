
import { NextResponse } from 'next/server';
import { getKnowledgeSummary } from '@/ai/engines/knowledge-engine';

export async function GET() {
  try {
    const data = await getKnowledgeSummary();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
