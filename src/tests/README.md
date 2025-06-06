# Tests Directory

This directory contains integration and unit tests for the Skynet Agent project.

## Available Tests

### Neo4j Integration Test
**File**: `neo4j-integration.test.js`
**Command**: `npm run test:neo4j`
**Purpose**: Tests the Knowledge Graph Service integration with Neo4j
**Requirements**: 
- Neo4j instance running on `bolt://localhost:7687`
- Environment variables: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`

**What it tests**:
- Connection establishment and health checks
- Node creation with complex data sanitization
- Relationship creation with property sanitization
- Complex query execution with parameter sanitization
- Enhanced deletion with dependency checking
- Data cleanup procedures

### Neo4j Advanced Deletion Test
**File**: `neo4j-advanced-deletion.test.js`
**Command**: `npm run test:neo4j-advanced`
**Purpose**: Tests advanced deletion capabilities of the Knowledge Graph Service
**Requirements**: Same as Neo4j Integration Test

**What it tests**:
- Session cascade deletion (deletes session + messages + tool invocations)
- Orphaned node cleanup with type exclusions
- Batch deletion by node type with property filters
- Dependency checking and safe deletion
- Comprehensive relationship management

### RAG System Test
**File**: `rag-test.ts`
**Command**: `npm run test:rag`
**Purpose**: Tests the RAG (Retrieval-Augmented Generation) system

### Integration Test
**File**: `integration-test.js`
**Command**: `npm run test:integration`
**Purpose**: General integration testing

### Conscious Memory Test
**File**: `conscious-memory-test.ts`
**Purpose**: Tests the conscious memory system

## Running Tests

### Individual Tests
```bash
# Run Neo4j integration test
npm run test:neo4j

# Run Neo4j advanced deletion test
npm run test:neo4j-advanced

# Run RAG system test
npm run test:rag

# Run general integration test
npm run test:integration
```

### All Tests
```bash
# Run all available tests
npm run test:all
```

## Prerequisites

### For Neo4j Tests
1. **Start Neo4j**:
   ```bash
   docker-compose up -d neo4j
   ```

2. **Verify Neo4j is running**:
   ```bash
   # Should return status 200
   Invoke-WebRequest -Uri "http://localhost:7474" -UseBasicParsing
   ```

3. **Environment Variables**:
   ```bash
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=password123
   ```

### For RAG Tests
- Ensure vector database is running (if applicable)
- Check embedding service configuration

## Test Structure

### Integration Tests
- **Purpose**: Test real system integrations
- **Environment**: Uses actual external services (Neo4j, databases, etc.)
- **Data**: Creates and cleans up real test data
- **Network**: Makes real network calls

### Unit Tests (Future)
- **Purpose**: Test individual components in isolation
- **Environment**: Mocked dependencies
- **Data**: Synthetic test data
- **Network**: No external calls

## Adding New Tests

1. **Create test file** in this directory
2. **Follow naming convention**: `*.test.js` or `*.test.ts`
3. **Add npm script** in `package.json`:
   ```json
   "test:yourtest": "npx tsx src/tests/yourtest.test.js"
   ```
4. **Update test:all script** to include your test
5. **Document requirements** in this README

## Troubleshooting

### Neo4j Connection Issues
- Verify Neo4j container is running: `docker ps`
- Check Neo4j logs: `docker-compose logs neo4j`
- Test manual connection: `Invoke-WebRequest -Uri "http://localhost:7474"`

### Import/Module Issues
- Ensure relative paths are correct from `src/tests/` directory
- Use `npx tsx` for TypeScript files
- Use `node` for JavaScript files

### Environment Variables
- Check `.env` file exists and is properly configured
- Verify environment variables are loaded in your test
