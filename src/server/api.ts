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

export function startApiServer(port: number = 3000, maxRetries: number = 5): Promise<any> {
  return new Promise((resolve, reject) => {
    // Recursive function to try different ports
    const attemptListen = (currentPort: number, retriesLeft: number) => {
      const server = app.listen(currentPort)
        .on('listening', () => {
          console.log(`API server listening on port ${currentPort}`);
          resolve(server);
        })
        .on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`Port ${currentPort} is already in use`);
            if (retriesLeft > 0) {
              console.log(`Trying port ${currentPort + 1}...`);
              server.close();
              attemptListen(currentPort + 1, retriesLeft - 1);
            } else {
              reject(new Error(`Unable to find available port after ${maxRetries} attempts`));
            }
          } else {
            reject(err);
          }
        });
    };

    // Start with initial port
    attemptListen(port, maxRetries);
  });
}
