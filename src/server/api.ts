import express from 'express';
import cors from 'cors';
import { processQuery } from '../agent';

const app = express();
app.use(express.json());
app.use(cors());

// Simple endpoint for user queries
app.post('/query', async (req, res) => {
  try {
    const { query, sessionId = 'default' } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const response = await processQuery(query, sessionId);
    return res.json({ response });
  } catch (error) {
    console.error('Error processing query:', error);
    return res.status(500).json({ 
      error: 'Failed to process query',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export function startApiServer(port: number = 3000) {
  return app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}
