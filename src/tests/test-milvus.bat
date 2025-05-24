@echo off
REM Milvus Integration Test Script for Windows
REM Tests the complete Skynet Agent + Milvus setup

echo 🧪 Starting Milvus Integration Tests for Windows...

set AGENT_URL=http://localhost:3000
set MILVUS_URL=http://localhost:9091
set TEST_SESSION=test_session_%RANDOM%

echo.
echo 🔍 Test 1: Service Health Checks

echo ℹ️  Checking Skynet Agent health...
curl -f -s "%AGENT_URL%/api/health" >nul
if errorlevel 1 (
    echo ❌ Skynet Agent is not responsive
    exit /b 1
) else (
    echo ✅ Skynet Agent is responsive
)

echo ℹ️  Checking Milvus WebUI...
curl -f -s "%MILVUS_URL%" >nul 2>&1
if errorlevel 1 (
    echo ❌ Milvus WebUI is not accessible
    exit /b 1
) else (
    echo ✅ Milvus WebUI is accessible
)

echo.
echo 🔍 Test 2: Detailed Health Status

echo ℹ️  Getting detailed health report...
curl -s "%AGENT_URL%/api/health/report" > health_report.tmp
findstr "milvus" health_report.tmp >nul
if errorlevel 1 (
    echo ❌ Milvus component not found in health report
    del health_report.tmp
    exit /b 1
) else (
    echo ✅ Milvus component found in health report
)

findstr "HEALTHY" health_report.tmp | findstr "milvus" >nul
if errorlevel 1 (
    echo ❌ Milvus component is not healthy
    type health_report.tmp
    del health_report.tmp
    exit /b 1
) else (
    echo ✅ Milvus component is HEALTHY
)

del health_report.tmp

echo.
echo 🔍 Test 3: Memory Operations

echo ℹ️  Testing memory storage...
curl -s -X POST "%AGENT_URL%/api/query" -H "Content-Type: application/json" -d "{\"query\": \"Remember that I prefer dark mode and my favorite language is TypeScript.\", \"sessionId\": \"%TEST_SESSION%\"}" > store_response.tmp

findstr "response" store_response.tmp >nul
if errorlevel 1 (
    echo ❌ Memory storage request failed
    type store_response.tmp
    del store_response.tmp
    exit /b 1
) else (
    echo ✅ Memory storage request processed
)

del store_response.tmp

echo ℹ️  Waiting for memory to be indexed...
timeout /t 3 >nul

echo ℹ️  Testing memory retrieval...
curl -s -X POST "%AGENT_URL%/api/query" -H "Content-Type: application/json" -d "{\"query\": \"What are my preferences?\", \"sessionId\": \"%TEST_SESSION%\"}" > retrieve_response.tmp

findstr "response" retrieve_response.tmp >nul
if errorlevel 1 (
    echo ❌ Memory retrieval request failed
    type retrieve_response.tmp
    del retrieve_response.tmp
    exit /b 1
) else (
    echo ✅ Memory retrieval request processed
)

findstr /i "dark.*mode\|typescript" retrieve_response.tmp >nul
if errorlevel 1 (
    echo ❌ Retrieved response does not contain stored memory information
    type retrieve_response.tmp
    del retrieve_response.tmp
    exit /b 1
) else (
    echo ✅ Retrieved response contains stored memory information
)

del retrieve_response.tmp

echo.
echo 🔍 Test 4: Memory System Status

echo ℹ️  Checking memory status...
curl -s "%AGENT_URL%/api/memory/status" > memory_status.tmp

findstr "memoryCount" memory_status.tmp >nul
if errorlevel 1 (
    echo ❌ Memory status endpoint not accessible
    del memory_status.tmp
    exit /b 1
) else (
    echo ✅ Memory status endpoint accessible
)

REM Extract memory count (simplified check)
findstr "memoryCount" memory_status.tmp | findstr "[1-9]" >nul
if errorlevel 1 (
    echo ❌ No memories found in storage
    type memory_status.tmp
    del memory_status.tmp
    exit /b 1
) else (
    echo ✅ Memory count is greater than 0
)

del memory_status.tmp

echo.
echo 🔍 Test 5: Performance Test

echo ℹ️  Running performance test with multiple queries...
for /l %%i in (1,1,5) do (
    curl -s -X POST "%AGENT_URL%/api/query" -H "Content-Type: application/json" -d "{\"query\": \"Test query number %%i for performance testing.\", \"sessionId\": \"%TEST_SESSION%\"}" >nul
)

echo ✅ Performance test completed

echo.
echo 🔍 Test 6: Vector Search Quality

echo ℹ️  Testing semantic search quality...

curl -s -X POST "%AGENT_URL%/api/query" -H "Content-Type: application/json" -d "{\"query\": \"Remember: My cat's name is Whiskers and she loves tuna.\", \"sessionId\": \"%TEST_SESSION%\"}" >nul

timeout /t 2 >nul

curl -s -X POST "%AGENT_URL%/api/query" -H "Content-Type: application/json" -d "{\"query\": \"What does my pet like to eat?\", \"sessionId\": \"%TEST_SESSION%\"}" > search_response.tmp

findstr /i "tuna\|fish\|cat" search_response.tmp >nul
if errorlevel 1 (
    echo ❌ Semantic search did not retrieve relevant information
    type search_response.tmp
    del search_response.tmp
    exit /b 1
) else (
    echo ✅ Semantic search retrieved relevant information
)

del search_response.tmp

echo.
echo 🔍 Test 7: Error Handling

echo ℹ️  Testing error handling with malformed request...
curl -s -X POST "%AGENT_URL%/api/query" -H "Content-Type: application/json" -d "{\"invalid\": \"request\"}" > error_response.tmp

findstr "error" error_response.tmp >nul
if errorlevel 1 (
    echo ❌ Error handling not working correctly
    type error_response.tmp
    del error_response.tmp
    exit /b 1
) else (
    echo ✅ Error handling works correctly
)

del error_response.tmp

echo.
echo 📊 Test Summary
echo ℹ️  Getting final system status...

echo System Status:
curl -s "%AGENT_URL%/api/health"

echo.
echo Memory Status:
curl -s "%AGENT_URL%/api/memory/status"

echo.
echo ✅ All Milvus Integration Tests Passed!
echo.
echo 🔧 System is ready for production use!
echo.
echo 📊 Access Points:
echo    • Skynet Agent:    %AGENT_URL%
echo    • Health Check:    %AGENT_URL%/api/health
echo    • Memory Status:   %AGENT_URL%/api/memory/status
echo    • Milvus WebUI:    %MILVUS_URL%

pause
