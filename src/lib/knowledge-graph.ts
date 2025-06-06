import neo4j, { Driver } from 'neo4j-driver'
import type { ChatSession, ChatMessage } from './chat-history'

export interface KnowledgeGraphConfig {
  uri: string
  username: string
  password: string
}

export class KnowledgeGraphService {
  private driver: Driver | null = null
  private readonly config: KnowledgeGraphConfig

  constructor(config?: Partial<KnowledgeGraphConfig>) {
    this.config = {
      uri: config?.uri || process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: config?.username || process.env.NEO4J_USERNAME || 'neo4j',
      password: config?.password || process.env.NEO4J_PASSWORD || 'neo4j'
    }
  }

  async initialize(): Promise<void> {
    if (this.driver) return
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.username, this.config.password)
    )
    await this.driver.verifyConnectivity()
    console.log('KnowledgeGraphService connected to', this.config.uri)
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close()
      this.driver = null
    }
  }

  private getSession() {
    if (!this.driver) throw new Error('KnowledgeGraphService not initialized')
    return this.driver.session()
  }

  async upsertSession(session: ChatSession): Promise<void> {
    const s = this.getSession()
    try {
      await s.run(
        `MERGE (sess:Session {id: $id})
         SET sess.title = $title,
             sess.createdAt = datetime($createdAt),
             sess.updatedAt = datetime($updatedAt)`,
        {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString()
        }
      )
    } finally {
      await s.close()
    }
  }

  async upsertMessage(message: ChatMessage): Promise<void> {
    const s = this.getSession()
    try {
      await s.run(
        `MERGE (m:Message {id: $id})
         SET m.content = $content,
             m.role = $role,
             m.createdAt = datetime($createdAt)
         WITH m
         MATCH (sess:Session {id: $sessionId})
         MERGE (sess)-[:HAS_MESSAGE]->(m)`,
        {
          id: message.id,
          content: message.content,
          role: message.role,
          createdAt: message.createdAt.toISOString(),
          sessionId: message.sessionId
        }
      )
    } finally {
      await s.close()
    }
  }

  async getSessions(): Promise<ChatSession[]> {
    const s = this.getSession()
    try {
      const res = await s.run(
        `MATCH (sess:Session)
         OPTIONAL MATCH (sess)-[:HAS_MESSAGE]->(m:Message)
         RETURN sess.id AS id, sess.title AS title,
                sess.createdAt AS createdAt, sess.updatedAt AS updatedAt,
                count(m) AS messageCount
         ORDER BY sess.updatedAt DESC`
      )
      return res.records.map(r => ({
        id: r.get('id'),
        title: r.get('title'),
        messages: [],
        messageCount: r.get('messageCount').toNumber ? r.get('messageCount').toNumber() : r.get('messageCount'),
        createdAt: new Date(r.get('createdAt')),
        updatedAt: new Date(r.get('updatedAt'))
      }))
    } finally {
      await s.close()
    }
  }
}

let kg: KnowledgeGraphService | null = null
export function getKnowledgeGraph(config?: Partial<KnowledgeGraphConfig>) {
  if (!kg) kg = new KnowledgeGraphService(config)
  return kg
}
