const { ChatHistoryDatabase } = require('../lib/chat-history')
const { getKnowledgeGraph } = require('../lib/knowledge-graph')

async function run() {
  const kg = getKnowledgeGraph()
  await kg.initialize()
  const db = ChatHistoryDatabase.getInstance()
  const sessions = db.getAllSessions()
  for (const session of sessions) {
    await kg.upsertSession(session)
    const full = db.getSession(session.id)
    if (full) {
      for (const msg of full.messages) {
        await kg.upsertMessage({
          ...msg,
          sessionId: session.id,
          createdAt: msg.createdAt
        })
      }
    }
  }
  await kg.close()
}

run().catch(err => {
  console.error('Neo4j sync failed:', err)
  process.exit(1)
})
