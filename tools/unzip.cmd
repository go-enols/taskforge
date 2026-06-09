@echo off
REM unzip.cmd — Node.js zip extractor (cross-platform, zero binary deps)
REM
REM This wrapper delegates to tools/unzip.cjs which uses:
REM   Windows → PowerShell Expand-Archive / .NET ZipFile (built-in)
REM   Unix    → system unzip command
REM
REM To install globally: copy both unzip.cjs and unzip.cmd to %APPDATA%\npm\

node "%~dp0unzip.cjs" %*
exit /b %ERRORLEVEL%
