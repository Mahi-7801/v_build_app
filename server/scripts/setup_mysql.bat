@echo off
REM ---------------------------------------------------------------------------
REM One-time local MySQL 8.4 setup for the Home Workout rebuild.
REM Creates the data directory, initialises an insecure root account,
REM registers the Windows service and starts it.
REM ---------------------------------------------------------------------------
setlocal

set MYSQL_HOME=C:\Program Files\MySQL\MySQL Server 8.4
set DATA_DIR=C:\Users\pc\AppData\Local\MySQL\MySQL84\Data
set MYSQLD=%MYSQL_HOME%\bin\mysqld.exe
set MYSQL=%MYSQL_HOME%\bin\mysql.exe

if not exist "%DATA_DIR%" (
  echo [setup] initialising data directory %DATA_DIR%
  mkdir "%DATA_DIR%"
  "%MYSQLD%" --initialize-insecure --datadir="%DATA_DIR%" --basedir="%MYSQL_HOME%" --console
  if errorlevel 1 (
    echo [setup] ERROR: mysqld --initialize-insecure failed
    exit /b 1
  )
) else (
  echo [setup] data directory already present
)

sc query MySQL84 >nul 2>&1
if errorlevel 1 (
  echo [setup] registering service MySQL84
  "%MYSQLD%" --install MySQL84 --defaults-file="%MYSQL_HOME%\my.ini"
  if errorlevel 1 (
    echo [setup] ERROR: service registration failed
    exit /b 1
  )
) else (
  echo [setup] service MySQL84 already registered
)

net start MySQL84
if errorlevel 1 (
  echo [setup] WARNING: service start returned an error, trying sc start
  sc start MySQL84
)

REM wait for the socket to accept connections
set /a tries=0
:wait
"%MYSQL%" -u root --protocol=TCP -h 127.0.0.1 -e "SELECT VERSION();" >nul 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% GEQ 30 (
  echo [setup] ERROR: server did not become ready
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto wait

:ready
echo [setup] MySQL is up.

REM set a root password (the server was initialised insecure)
"%MYSQL%" -u root --protocol=TCP -h 127.0.0.1 -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'root'; FLUSH PRIVILEGES;" 2>nul
if errorlevel 1 (
  echo [setup] root password already set (or change failed) - continuing
)

"%MYSQL%" -u root -proot --protocol=TCP -h 127.0.0.1 -e "SELECT VERSION() AS mysql_version;"
echo [setup] done. Connection: mysql -u root -proot -h 127.0.0.1
endlocal
