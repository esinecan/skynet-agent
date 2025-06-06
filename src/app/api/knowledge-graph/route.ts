import { NextResponse } from 'next/server'
import { getKnowledgeGraph } from '../../../lib/knowledge-graph'

export async function GET() {
  try {
    const kg = getKnowledgeGraph()
    await kg.initialize()
    const sessions = await kg.getSessions()
    return NextResponse.json({ sessions })
  } catch (err) {
    console.error('KG query failed', err)
    return NextResponse.json({ error: 'Failed to query knowledge graph' }, { status: 500 })
  }
}
