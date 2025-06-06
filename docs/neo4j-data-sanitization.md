# Neo4j Data Sanitization Guide

## Overview

Neo4j has strict requirements for property data types. This guide explains the data sanitization that happens automatically in our Knowledge Graph Service and what developers need to know.

## Supported Neo4j Property Types

Neo4j **ONLY** supports the following property types:
- `null`
- `boolean`
- `number` (integers and floats)
- `string`
- Arrays of the above types

## Automatic Sanitization

Our `KnowledgeGraphService` automatically sanitizes data in the following methods:
- `addNode()` - node properties
- `addRelationship()` - relationship properties  
- `runQuery()` - query parameters

### Conversion Rules

| Input Type | Neo4j Output | Notes |
|------------|--------------|-------|
| `null`, `undefined` | `null` | Safe conversion |
| `boolean` | `boolean` | No conversion needed |
| `number` | `number` | No conversion needed |
| `string` | `string` | No conversion needed |
| `Date` | `string` | Converted to ISO string via `.toISOString()` |
| `object` | `string` | Converted to JSON string via `JSON.stringify()` |
| `Array` | `Array` | Elements recursively sanitized |
| Other types | `string` | Converted via `String()` as fallback |

## Examples

### Date Handling
```typescript
// Input
const node = {
  id: 'user-1',
  type: 'User',
  properties: {
    createdAt: new Date('2025-06-06T18:44:00Z'),
    lastLogin: new Date()
  }
};

// After sanitization (automatic)
// createdAt: "2025-06-06T18:44:00.000Z"
// lastLogin: "2025-06-06T18:45:23.456Z"
```

### Complex Object Handling
```typescript
// Input
const node = {
  id: 'chat-1',
  type: 'ChatSession',
  properties: {
    metadata: {
      model: 'gpt-4',
      tokens: 1500,
      config: { temperature: 0.7 }
    }
  }
};

// After sanitization (automatic)
// metadata: '{"model":"gpt-4","tokens":1500,"config":{"temperature":0.7}}'
```

### Array Handling
```typescript
// Input
const node = {
  id: 'memory-1',
  type: 'Memory',
  properties: {
    tags: ['important', new Date(), { type: 'metadata' }],
    scores: [0.8, 0.9, 0.7]
  }
};

// After sanitization (automatic)
// tags: ['important', '2025-06-06T18:44:00.000Z', '{"type":"metadata"}']
// scores: [0.8, 0.9, 0.7] (unchanged)
```

## Best Practices

###  Do
- Use the sanitization automatically provided by `KnowledgeGraphService`
- Store timestamps as `Date` objects in your application code
- Use appropriate data types in your application logic
- Let the service handle the conversion to Neo4j-compatible formats

###  Don't
- Manually convert dates to strings before passing to the service
- Pass unsupported types directly to Neo4j driver methods
- Bypass the `KnowledgeGraphService` methods for direct Neo4j operations
- Assume complex objects will be stored as-is in Neo4j

## Data Retrieval

When retrieving data from Neo4j:
- Dates will come back as strings (ISO format)
- Complex objects will come back as JSON strings
- You may need to parse/convert them back to appropriate types in your application

### Example Retrieval and Conversion
```typescript
// Get data from Neo4j
const result = await kgService.runQuery('MATCH (n:User {id: $id}) RETURN n', { id: 'user-1' });
const user = result[0].n.properties;

// Convert back to appropriate types
const userData = {
  ...user,
  createdAt: new Date(user.createdAt), // Convert ISO string back to Date
  metadata: user.metadata ? JSON.parse(user.metadata) : null // Parse JSON string back to object
};
```

## Troubleshooting

### Common Errors

**Error**: `Property values can only be of primitive types or arrays thereof`
- **Cause**: Trying to store unsupported data types
- **Solution**: Ensure you're using `KnowledgeGraphService` methods, not direct driver calls

**Error**: `Invalid date string` when retrieving
- **Cause**: Date wasn't properly converted during storage
- **Solution**: Check that dates are properly converted to Date objects before storage

### Debug Tips
- Check the sanitization by logging the properties before they go to Neo4j
- Use Neo4j Browser to inspect the actual stored values
- Verify data types using Cypher queries: `RETURN type(n.propertyName)`

## Integration Points

This sanitization is especially important for:
- **Chat History Integration**: Messages with timestamps and metadata
- **Conscious Memory System**: Memory objects with creation/access times
- **RAG System**: Documents with processing timestamps and embeddings metadata
- **User Activity Tracking**: Events with timestamps and complex payloads

All data flowing through these systems into the knowledge graph will be automatically sanitized.

---

# Knowledge Graph Service Implementation Summary

##  Completed Features

### Core Neo4j Integration
- **Connection Management**: Automatic connection handling with environment variables
- **Health Checks**: Built-in health monitoring and connection verification
- **Session Management**: Proper session lifecycle management

### CRUD Operations
- **Node Management**: `addNode()`, `deleteNode()` with automatic sanitization
- **Relationship Management**: `addRelationship()` with property sanitization  
- **Query Execution**: `runQuery()` with automatic parameter sanitization

### Data Sanitization (Critical Feature)
- **Automatic Date Conversion**: Date objects → ISO strings
- **Object Serialization**: Complex objects → JSON strings
- **Array Processing**: Recursive sanitization of array elements
- **Type Safety**: Fallback conversions for unsupported types
- **Applied Everywhere**: All methods automatically sanitize data

### Places Data Sanitization is Active:
1. `addNode()` - node properties sanitized
2. `addRelationship()` - relationship properties sanitized
3. `runQuery()` - query parameters sanitized

### Testing & Validation
- **Comprehensive Integration Tests**: Verifies all functionality
- **Real Neo4j Testing**: Tests against actual Neo4j 5.20 instance
- **Edge Case Coverage**: Complex objects, dates, arrays, null values
- **Cleanup Procedures**: Automatic test data cleanup

##  Ready for Integration

The Knowledge Graph Service is now **production-ready** for integration with:

### Immediate Integration Candidates:
- **Chat History System**: Store conversations with timestamps and metadata
- **Conscious Memory System**: Create knowledge graphs from memory objects
- **RAG System**: Store document relationships and semantic connections
- **User Activity Tracking**: Track user interactions and learning patterns

### Key Benefits:
- **Zero Data Type Worries**: Automatic sanitization handles all data conversion
- **Robust Error Handling**: Comprehensive error catching and logging
- **Neo4j Best Practices**: Follows Neo4j connection and query patterns
- **Type Safety**: Full TypeScript support with proper interfaces

##  Configuration

### Environment Variables Required:
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j  
NEO4J_PASSWORD=password123
```

### Docker Setup:
- Neo4j 5.20.0 Community Edition
- HTTP endpoint: http://localhost:7474
- Bolt endpoint: bolt://localhost:7687
- Data persistence in `./data/neo4j`

##  Performance Characteristics

### Connection Management:
- **Lazy Connection**: Connects only when needed
- **Connection Reuse**: Single session per service instance
- **Graceful Shutdown**: Proper cleanup on service termination

### Data Processing:
- **Efficient Sanitization**: O(n) complexity for object traversal
- **Memory Conscious**: Minimal object copying during sanitization
- **Error Recovery**: Graceful handling of serialization failures

##  Next Steps

The service is ready for:
1. **Integration into main application**: Import and use immediately
2. **Knowledge Graph Sync Service**: Build higher-level orchestration
3. **Advanced Query Patterns**: Implement domain-specific query helpers
4. **Analytics & Insights**: Add graph analysis capabilities

All foundational work is complete - the service handles the complex data sanitization and Neo4j interaction details automatically.
