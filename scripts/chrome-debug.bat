@echo off
REM Launch Chrome with remote debugging enabled on port 9222
REM This is required for the Chrome DevTools MCP server

REM Common Chrome paths on Windows
set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

echo Launching Chrome with remote debugging (port 9222)...
echo Using: %CHROME_PATH%

REM --remote-debugging-port=9222 enables DevTools protocol on port 9222
REM --no-first-run skips the first run wizard
REM --disable-default-apps disables default apps
if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" --remote-debugging-port=9222 --no-first-run --disable-default-apps http://localhost:3000
    echo Chrome launched successfully!
    echo The Chrome DevTools MCP server can now connect to port 9222.
) else (
    echo ERROR: Chrome not found at expected locations.
    echo Please install Google Chrome or update the path in this script.
    pause
)
