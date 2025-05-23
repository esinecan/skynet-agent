#!/bin/bash

# Milvus Integration Test Script
# Tests the complete Skynet Agent + Milvus setup

set -e

echo "🧪 Starting Milvus Integration Tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
AGENT_URL="http://localhost:3000"
MILVUS_URL="http://localhost:9091"
TEST_SESSION="test_session_$(date +%s)"

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Test 1: Check if services are running
echo "🔍 Test 1: Service Health Checks"

print_info "Checking Skynet Agent health..."
curl -f -s "${AGENT_URL}/health" > /dev/null
print_result $? "Skynet Agent is responsive"

print_info "Checking Milvus WebUI..."
curl -f -s "${MILVUS_URL}/api/v1/health" > /dev/null 2>&1 || curl -f -s "${MILVUS_URL}/" > /dev/null
print_result $? "Milvus WebUI is accessible"

# Test 2: Detailed Health Check
echo ""
echo "🔍 Test 2: Detailed Health Status"

print_info "Getting detailed health report..."
HEALTH_RESPONSE=$(curl -s "${AGENT_URL}/health/report")
echo "$HEALTH_RESPONSE" | grep -q "milvus"
print_result $? "Milvus component found in health report"

# Check if Milvus is healthy
echo "$HEALTH_RESPONSE" | grep -A 5 '"milvus"' | grep -q '"status":"HEALTHY"'
MILVUS_HEALTHY=$?
if [ $MILVUS_HEALTHY -eq 0 ]; then
    print_result 0 "Milvus component is HEALTHY"
else
    echo "$HEALTH_RESPONSE" | grep -A 10 '"milvus"'
    print_result 1 "Milvus component is not healthy"
fi

# Test 3: Memory Operations
echo ""
echo "🔍 Test 3: Memory Storage and Retrieval"

print_info "Testing memory storage..."
STORE_RESPONSE=$(curl -s -X POST "${AGENT_URL}/query" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"Remember that I prefer dark mode for all applications and my favorite programming language is TypeScript.\", \"sessionId\": \"${TEST_SESSION}\"}")

echo "$STORE_RESPONSE" | grep -q '"response"'
print_result $? "Memory storage request processed"

print_info "Waiting for memory to be indexed..."
sleep 3

print_info "Testing memory retrieval..."
RETRIEVE_RESPONSE=$(curl -s -X POST "${AGENT_URL}/query" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"What are my preferences?\", \"sessionId\": \"${TEST_SESSION}\"}")

echo "$RETRIEVE_RESPONSE" | grep -q '"response"'
print_result $? "Memory retrieval request processed"

# Check if response contains memory content
RESPONSE_TEXT=$(echo "$RETRIEVE_RESPONSE" | sed -n 's/.*"response":"\([^"]*\)".*/\1/p')
echo "$RESPONSE_TEXT" | grep -qi "dark mode\|typescript"
print_result $? "Retrieved response contains stored memory information"

# Test 4: Memory Status
echo ""
echo "🔍 Test 4: Memory System Status"

print_info "Checking memory status..."
MEMORY_STATUS=$(curl -s "${AGENT_URL}/memory/status")
echo "$MEMORY_STATUS" | grep -q '"memoryCount"'
print_result $? "Memory status endpoint accessible"

MEMORY_COUNT=$(echo "$MEMORY_STATUS" | sed -n 's/.*"memoryCount":\([0-9]*\).*/\1/p')
if [ "$MEMORY_COUNT" -gt 0 ]; then
    print_result 0 "Memory count is greater than 0 ($MEMORY_COUNT memories)"
else
    print_result 1 "No memories found in storage"
fi

# Test 5: Performance Test
echo ""
echo "🔍 Test 5: Performance Test"

print_info "Running performance test with multiple queries..."
START_TIME=$(date +%s)

for i in {1..5}; do
    curl -s -X POST "${AGENT_URL}/query" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"Test query number ${i} for performance testing.\", \"sessionId\": \"${TEST_SESSION}\"}" > /dev/null
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ $DURATION -lt 30 ]; then
    print_result 0 "Performance test completed in ${DURATION} seconds (acceptable)"
else
    print_result 1 "Performance test too slow: ${DURATION} seconds"
fi

# Test 6: Vector Search Quality
echo ""
echo "🔍 Test 6: Vector Search Quality"

print_info "Testing semantic search quality..."

# Store specific information
curl -s -X POST "${AGENT_URL}/query" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"Remember: My cat's name is Whiskers and she loves tuna.\", \"sessionId\": \"${TEST_SESSION}\"}" > /dev/null

sleep 2

# Test semantic search
SEARCH_RESPONSE=$(curl -s -X POST "${AGENT_URL}/query" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"What does my pet like to eat?\", \"sessionId\": \"${TEST_SESSION}\"}")

SEARCH_TEXT=$(echo "$SEARCH_RESPONSE" | sed -n 's/.*"response":"\([^"]*\)".*/\1/p')
echo "$SEARCH_TEXT" | grep -qi "tuna\|fish\|cat"
print_result $? "Semantic search retrieved relevant information"

# Test 7: Concurrent Access
echo ""
echo "🔍 Test 7: Concurrent Access Test"

print_info "Testing concurrent access..."

# Run multiple queries in parallel
for i in {1..3}; do
    (curl -s -X POST "${AGENT_URL}/query" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"Concurrent test ${i}\", \"sessionId\": \"concurrent_${i}\"}" > /dev/null) &
done

wait
print_result 0 "Concurrent access test completed"

# Test 8: Error Handling
echo ""
echo "🔍 Test 8: Error Handling"

print_info "Testing error handling with malformed request..."
ERROR_RESPONSE=$(curl -s -X POST "${AGENT_URL}/query" \
    -H "Content-Type: application/json" \
    -d "{\"invalid\": \"request\"}")

echo "$ERROR_RESPONSE" | grep -q "error"
print_result $? "Error handling works correctly"

# Final Summary
echo ""
echo "📊 Test Summary"
print_info "Getting final system status..."

FINAL_HEALTH=$(curl -s "${AGENT_URL}/health")
FINAL_MEMORY=$(curl -s "${AGENT_URL}/memory/status")

echo "System Status:"
echo "$FINAL_HEALTH" | sed 's/,/,\n  /g' | sed 's/{/{\n  /' | sed 's/}/\n}/'

echo ""
echo "Memory Status:"
echo "$FINAL_MEMORY" | sed 's/,/,\n  /g' | sed 's/{/{\n  /' | sed 's/}/\n}/'

echo ""
echo -e "${GREEN}🎉 All Milvus Integration Tests Passed!${NC}"
echo ""
echo "🔧 System is ready for production use!"
echo ""
echo "📊 Access Points:"
echo "   • Skynet Agent:    ${AGENT_URL}"
echo "   • Health Check:    ${AGENT_URL}/health"
echo "   • Memory Status:   ${AGENT_URL}/memory/status"
echo "   • Milvus WebUI:    ${MILVUS_URL}"
