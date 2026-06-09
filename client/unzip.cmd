@echo off
REM unzip.cmd — cross-platform unzip wrapper for Windows
REM Usage: unzip [-o] [-d DEST] <zipfile>
REM Priority: Git unzip > PowerShell .NET ZipFile fallback

setlocal enabledelayedexpansion
set "OVERWRITE="
set "ZIP="
set "DEST="

REM --- try Git unzip first (fast) ------------------------------------------
for %%D in (
  "%ProgramFiles%\Git\usr\bin\unzip.exe"
  "%ProgramFiles(x86)%\Git\usr\bin\unzip.exe"
  "%LOCALAPPDATA%\Programs\Git\usr\bin\unzip.exe"
  "D:\App\Git\usr\bin\unzip.exe"
) do (
  if exist %%D ( %%D %* & exit /b !ERRORLEVEL! )
)

REM --- parse args -----------------------------------------------------------
:parse
if "%~1"=="" goto do_extract
if "%~1"=="-o" set "OVERWRITE=1" & shift & goto parse
if "%~1"=="-q" shift & goto parse
if "%~1"=="-l" ( set "ZIP=%~2" & goto do_list )
if "%~1"=="-d" ( set "DEST=%~2" & shift & shift & goto parse )
set "ZIP=%~1"
shift
goto parse

:do_list
if "%ZIP%"=="" exit /b 0
powershell -NoProfile -Command "[IO.Compression.ZipFile]::OpenRead('%ZIP%').Entries|%%{Write-Host $_.FullName}"
exit /b 0

:do_extract
if "%ZIP%"=="" ( echo Usage: unzip [-o] [-d dest] zipfile & exit /b 1 )
if "%DEST%"=="" set "DEST=."
if not exist "%DEST%" mkdir "%DEST%" 2>nul

set "PS=$a='%ZIP%';$b='%DEST%';$ow=%OVERWRITE%;Add-Type -A System.IO.Compression.FileSystem;"
set "PS=%PS% $z=[IO.Compression.ZipFile]::OpenRead($a);"
set "PS=%PS% foreach($e in $z.Entries){"
set "PS=%PS%   if($e.Name-eq''){continue}"
set "PS=%PS%   $p=Join-Path $b $e.FullName;"
set "PS=%PS%   $d=Split-Path $p;if($d-and!(Test-Path $d)){[void](New-Item $d -ItemType Dir -Force)}"
set "PS=%PS%   if($ow-or!(Test-Path $p)){[IO.Compression.ZipFileExtensions]::ExtractToFile($e,$p,$ow)}"
set "PS=%PS% }$z.Dispose()"

powershell -NoProfile -Command "%PS%"
exit /b %ERRORLEVEL%
