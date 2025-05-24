@echo off
REM Skynet Agent Docker Startup Script for Windows

REM Create necessary directories
if not exist volumes mkdir volumes
if not exist volumes\etcd mkdir volumes\etcd
if not exist volumes\milvus mkdir volumes\milvus
if not exist volumes\minio mkdir volumes\minio
if not exist data mkdir data
if not exist data\memory mkdir data\memory

REM Copy environment variables if .env doesn't exist
if not exist .env (
    echo 📋 Copying .env.example to .env...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your API keys before continuing
    echo    Required: GEMINI_API_KEY or other LLM provider API key
    exit /b 1
)

REM Check if API key is configured (basic check)
findstr /B "GEMINI_API_KEY=.*[^=]" .env >nul
if errorlevel 1 (
    findstr /B "OPENAI_API_KEY=.*[^=]" .env >nul
    if errorlevel 1 (
        echo ⚠️  No API key found in .env file
        echo    Please set GEMINI_API_KEY or OPENAI_API_KEY in .env file
        exit /b 1
    )
)

echo 📦 Building and starting services...

REM Build TypeScript and upload source maps to Sentry (if configured)
echo 🔧 Building TypeScript and preparing source maps...
call npm run build
if exist dist (
    if defined SENTRY_DSN (
        echo 📤 Uploading source maps to Sentry...
        npx @sentry/wizard@latest -i sourcemaps --saas --quiet || echo ⚠️  Source map upload failed ^(continuing anyway^)
    ) else (
        echo ℹ️  SENTRY_DSN not configured, skipping source map upload
    )
) else (
    echo ⚠️  Build failed, dist directory not found
)

REM Build and start all services
docker-compose up --build -d

echo ⏳ Waiting for services to be healthy...

REM Wait for Milvus to be healthy
set max_attempts=30
set attempt=0

:wait_milvus
docker-compose ps milvus | findstr "healthy" >nul
if not errorlevel 1 (
    echo ✅ Milvus is healthy
    goto wait_agent
)
timeout /t 10 >nul
set /a attempt+=1
if %attempt% lss %max_attempts% goto wait_milvus

echo ❌ Milvus failed to become healthy
docker-compose logs milvus
exit /b 1

:wait_agent
REM Wait for Skynet Agent to be healthy
set attempt=0

:wait_agent_loop
curl -f http://localhost:3000/health >nul 2>&1
if not errorlevel 1 (
    echo ✅ Skynet Agent is healthy
    goto success
)
echo ⏳ Waiting for Skynet Agent... (attempt %attempt%/%max_attempts%)
timeout /t 5 >nul
set /a attempt+=1
if %attempt% lss %max_attempts% goto wait_agent_loop

echo ❌ Skynet Agent failed to become healthy
docker-compose logs skynet-agent
exit /b 1

:success
echo.
echo 🎉 Skynet Agent is now running!
echo.
echo 📊 Service URLs:
echo    • Skynet Agent:    http://localhost:3000
echo    • Health Check:    http://localhost:3000/health
echo    • Milvus WebUI:    http://localhost:9091
echo    • Minio Console:   http://localhost:9001 (admin/admin)
echo.
echo 📋 Useful commands:
echo    • View logs:       docker-compose logs -f
echo    • Stop services:   docker-compose down
echo    • Restart:         docker-compose restart skynet-agent
echo.
echo 🔍 Check status:
echo    docker-compose ps
