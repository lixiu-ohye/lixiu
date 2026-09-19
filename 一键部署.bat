@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM ============================================================
REM   li-xiu workbench  --  ONE-CLICK DEPLOY
REM   build -> regression test -> commit -> push -> live verify
REM
REM   Usage:
REM     double-click this file            normal run (pauses at end)
REM     deploy.bat "my commit message"    custom commit message
REM
REM   NOTE: this file is intentionally 100% ASCII.
REM   The Windows user folder contains non-ASCII chars, so every
REM   path living under it is resolved through %USERPROFILE%
REM   (expanded at runtime by cmd, Unicode-safe) instead of being
REM   written literally here. Same reason the default commit
REM   message below is English - a non-ASCII argument passed
REM   through cmd can get mangled by the active code page.
REM ============================================================

set "ROOT=D:\lixiu-project"
set "GIT=D:\Tools\PortableGit\cmd\git.exe"
set "NODE=D:\Tools\node.exe"
set "PY=python"
REM force UTF-8 IO: this machine ANSI codepage is cp950, and python
REM crashes with UnicodeEncodeError the moment it prints non-ASCII.
set "PYTHONIOENCODING=utf-8"
set "NODE_MODULES=%USERPROFILE%\.workbuddy\binaries\node\workspace\node_modules"
set "SITE=https://lixiu-ohye.github.io/lixiu/workbench.html"

set "MSG=%~1"
if "%MSG%"=="" set "MSG=chore: one-click deploy (build + regression tests green)"

REM unattended mode: set LIXIU_NOPAUSE=1 to skip the final pause
set "NOPAUSE="
if "%LIXIU_NOPAUSE%"=="1" set "NOPAUSE=1"

echo.
echo ==========================================================
echo   li-xiu workbench  -  one-click deploy
echo ==========================================================

if not exist "%ROOT%" ( echo [X] repo not found: %ROOT% & if not defined NOPAUSE pause & exit /b 2 )
if not exist "%GIT%"  ( echo [X] git not found: %GIT%   & if not defined NOPAUSE pause & exit /b 2 )
if not exist "%NODE%" ( echo [X] node not found: %NODE% & if not defined NOPAUSE pause & exit /b 2 )

cd /d "%ROOT%"

echo.
echo --- [1/5] build workbench.html -------------------------
"%PY%" h5\build_editor.py
if errorlevel 1 ( echo [X] BUILD FAILED - nothing was committed & if not defined NOPAUSE pause & exit /b 1 )

echo.
echo --- [2/5] browser regression test ----------------------
set "NODE_PATH=%NODE_MODULES%"
"%NODE%" h5\tests\audit_workbench.js
if errorlevel 1 ( echo [X] TEST FAILED - nothing was committed & if not defined NOPAUSE pause & exit /b 1 )

echo.
echo --- [3/5] stage + commit -------------------------------
REM only our own files are staged on purpose: this repo is being
REM edited by several workflows at once, so a blind "git add -A"
REM would sweep up other people's half-finished work.
REM *.bat is a wildcard on purpose - this file itself has a non-ASCII
REM name, and cmd would mangle that literal through the code page.
REM cmd does not expand wildcards for external programs, git does.
"%GIT%" add -- workbench.html h5\workbench.html h5\index.html h5\editor h5\tests h5\build_editor.py h5\build_workbench.py .gitignore *.bat
"%GIT%" status --short
"%GIT%" commit -m "%MSG%"
if errorlevel 1 echo [i] commit skipped (nothing new to commit), continue.

echo.
echo --- [4/5] push -----------------------------------------
REM autostash keeps other workflows' uncommitted edits safe
REM across the rebase; they are reapplied right after.
"%GIT%" pull --rebase --autostash
if errorlevel 1 ( echo [X] rebase failed - resolve by hand & if not defined NOPAUSE pause & exit /b 1 )
"%GIT%" push
if errorlevel 1 ( echo [X] PUSH FAILED & if not defined NOPAUSE pause & exit /b 1 )

echo.
echo --- [5/5] live byte-for-byte check ---------------------
REM "push succeeded" is NOT the same as "the site really changed".
REM GitHub Pages has a CDN delay, so poll until the live bytes match.
"%NODE%" h5\tests\verify_live.js --tries 20 --wait 15 workbench.html
set "VS=%errorlevel%"

echo.
if "%VS%"=="0" (
  echo ==========================================================
  echo   DONE - the live page matches the local build.
  echo ==========================================================
) else (
  echo ==========================================================
  echo   PUSHED, but the live check timed out.
  echo   The Pages CDN may still be catching up - rerun this file
  echo   later, or run:  node h5\tests\verify_live.js
  echo ==========================================================
)
echo   %SITE%
echo.
if not defined NOPAUSE pause
exit /b %VS%
