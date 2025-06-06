/**
 * Script to test the conscious memory API endpoints
 */

async function testConsciousMemoryAPI() {
  const BASE_URL = 'http://localhost:3000';
  
  console.log(' Testing Conscious Memory API...');
  
  try {
    // Test 1: Health check
    console.log('\n1. Testing health check...');
    const healthResponse = await fetch(`${BASE_URL}/api/conscious-memory?action=health`);
    const healthData = await healthResponse.json();
    console.log('Health:', healthData);
    
    // Test 2: Save a memory
    console.log('\n2. Testing save memory...');
    const saveResponse = await fetch(`${BASE_URL}/api/conscious-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        content: 'This is a test conscious memory about API testing',
        tags: ['test', 'api', 'validation'],
        importance: 8,
        source: 'explicit',
        context: 'Testing the conscious memory API endpoints'
      })
    });
    const saveData = await saveResponse.json();
    console.log('Save result:', saveData);
    
    // Test 3: Search memories
    console.log('\n3. Testing search memories...');
    const searchResponse = await fetch(`${BASE_URL}/api/conscious-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search',
        query: 'test API',
        options: { limit: 5 }
      })
    });
    const searchData = await searchResponse.json();
    console.log('Search results:', searchData);
    
    // Test 4: Get stats
    console.log('\n4. Testing get stats...');
    const statsResponse = await fetch(`${BASE_URL}/api/conscious-memory?action=stats`);
    const statsData = await statsResponse.json();
    console.log('Stats:', statsData);
    
    // Test 5: Get tags
    console.log('\n5. Testing get tags...');
    const tagsResponse = await fetch(`${BASE_URL}/api/conscious-memory?action=tags`);
    const tagsData = await tagsResponse.json();
    console.log('Tags:', tagsData);
    
    console.log('\n All API tests completed!');
    
  } catch (error) {
    console.error(' API test failed:', error);
  }
}

// Export for use in other scripts
if (typeof window === 'undefined') {
  // Node.js environment
  testConsciousMemoryAPI();
}

export { testConsciousMemoryAPI };
