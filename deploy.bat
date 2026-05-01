@echo off
setlocal
echo ========================================
echo   Colonel Mustard - Deploy
echo ========================================
echo.
cd /d "%~dp0"

echo [1/3] Installing dependencies...
call npm install --silent
if %ERRORLEVEL% NEQ 0 ( echo. & echo INSTALL FAILED & pause & exit /b 1 )

echo [2/3] Building (output saved to build.log)...
call npm run build > build.log 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo   BUILD FAILED
    echo ========================================
    echo Last 30 lines of build.log:
    echo.
    powershell -Command "Get-Content build.log -Tail 30"
    echo.
    echo Full log saved to build.log
    pause
    exit /b 1
)
echo Build OK.

echo [3/3] Deploying to Vercel...
call vercel --prod --yes
if %ERRORLEVEL% NEQ 0 ( echo. & echo DEPLOY FAILED & pause & exit /b 1 )

echo.
echo ========================================
echo   DEPLOYED to colonel-mustard.vercel.app
echo ========================================
pause
