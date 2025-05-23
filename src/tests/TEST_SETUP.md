# Skynet Agent Test Configuration

This document outlines the steps needed to properly configure and run the test suite for the Skynet Agent project.

## Current Test Status

The test suite is currently configured but fails to run due to Jest configuration issues with TypeScript and ESM imports. The error message indicates:

```
SyntaxError: Cannot use import statement outside a module
```

## Required Configuration

To properly run the tests, the following configuration changes are needed:

1. **Jest Configuration for TypeScript**:
   - Create a `jest.config.js` file in the project root
   - Configure TypeScript preset and transformers

2. **ESM Support**:
   - Configure Jest to handle ES Modules
   - Set the appropriate module resolution

## Jest Configuration File

Create a file named `jest.config.js` in the project root with the following content:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol|@langchain)/)'
  ],
};
```

## Package.json Updates

Add the following dev dependencies:

```json
"devDependencies": {
  "jest": "^29.0.0",
  "ts-jest": "^29.0.0",
  "@types/jest": "^29.0.0"
}
```

## Running Tests

After making these configuration changes, you can run the tests with:

```bash
npm test
```

## Alternative Testing Approach

If configuring Jest proves challenging, an alternative approach is to use `ts-node` directly to run the test script:

```bash
npx ts-node src/tests/test.ts
```

This bypasses Jest and runs the TypeScript file directly, which may be simpler for initial testing.

## Manual Testing

Until the automated tests are properly configured, you can manually test the system by:

1. Starting the server:
   ```bash
   npx ts-node src/run.ts
   ```

2. Sending requests to the API endpoints:
   ```bash
   curl -X POST -H "Content-Type: application/json" -d '{"query":"Hello, what can you do?"}' http://localhost:8080/query
   ```

3. Checking health status:
   ```bash
   curl http://localhost:8080/health
   ```
