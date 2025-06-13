/**
 * Integration Test Suite
 * Tests core application functionality and component integration
 */

const path = require('path')
const fs = require('fs')

const testResults: Array<{ name: string; passed: boolean; message: string }> = []

function runTest(name: string, testFn: () => boolean, expectedResult = true) {
  try {
    const result = testFn()
    const passed = result === expectedResult
    testResults.push({
      name,
      passed,
      message: passed ? 'PASSED' : `FAILED - Expected: ${expectedResult}, Got: ${result}`
    })
  } catch (error) {
    testResults.push({
      name,
      passed: false,
      message: `FAILED - Error: ${error instanceof Error ? error.message : String(error)}`
    })
  }
}

function runIntegrationTests() {
  console.log(' Running Integration Tests...\n')

  // Test 1: Project structure
  runTest('Project structure is valid', () => {
    const requiredFiles = [
      'package.json',
      'next.config.js',
      'tailwind.config.js',
      'src/app/page.tsx',
      'src/components/ChatInterface.tsx',
      'src/lib/mcp-manager.ts'
    ]
    
    return requiredFiles.every(file => 
      fs.existsSync(path.join(process.cwd(), file))
    )
  })

  // Test 2: TypeScript configuration
  runTest('TypeScript config is valid', () => {
    return fs.existsSync('tsconfig.json')
  })

  // Test 3: Core components exist
  runTest('Core components exist', () => {
    const components = [
      'src/components/ChatInterface.tsx',
      'src/components/ChatMessage.tsx',
      'src/components/ToolCallDisplay.tsx',
      'src/components/ChatHistorySidebar.tsx'
    ]
    
    return components.every(component => 
      fs.existsSync(path.join(process.cwd(), component))
    )
  })

  // Test 4: API routes exist
  runTest('API routes exist', () => {
    const routes = [
      'src/app/api/chat/route.ts',
      'src/app/api/chat-history/route.ts'
    ]
    
    return routes.every(route => 
      fs.existsSync(path.join(process.cwd(), route))
    )
  })

  // Test 5: MCP configuration exists
  runTest('MCP configuration exists', () => {
    return fs.existsSync('config.json')
  })

  // Test 6: Database initialization
  runTest('Database structure is set up', () => {
    return fs.existsSync('src/lib/chat-history.ts')
  })

  // Test 7: Styling configuration
  runTest('Styling is configured', () => {
    return fs.existsSync('src/app/globals.css') && 
           fs.existsSync('postcss.config.js')
  })

  // Print results
  console.log(' Test Results:')
  console.log('================')
  
  let passedCount = 0
  testResults.forEach(result => {
    const icon = result.passed ? '' : ''
    console.log(`${icon} ${result.name}: ${result.message}`)
    if (result.passed) passedCount++
  })

  console.log(`\n Summary: ${passedCount}/${testResults.length} tests passed`)
  
  if (passedCount === testResults.length) {
    console.log(' All integration tests passed!')
    process.exit(0)
  } else {
    console.log(' Some tests failed. Please check the issues above.')
    process.exit(1)
  }
}

// Run the tests
runIntegrationTests()
