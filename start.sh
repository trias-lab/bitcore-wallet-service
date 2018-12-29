#!/bin/bash

mkdir -p logs
mkdir -p pids

# run_program (nodefile, pidfile, logfile)
run_program ()
{
  nodefile=$1
  pidfile=$2
  logfile=$3
  trace=$4

  if [ -e "$pidfile" ]
  then
    echo "$nodefile is already running. Run 'npm stop' if you wish to restart."
    return 0
  fi

  if [ x"$trace" = x ]; then
    nohup node $nodefile >> $logfile 2>&1 &
  else
    echo "has trace flag"
    node --inspect=0.0.0.0:9229 $nodefile  
  fi

  #nohup node $nodefile >> $logfile 2>&1 &
  PID=$!
  if [ $? -eq 0 ]
  then
    echo "Successfully started $nodefile. PID=$PID. Logs are at $logfile"
    echo $PID > $pidfile
    return 0
  else
    echo "Could not start $nodefile - check logs at $logfile"
    exit 1
  fi
}

run_program locker/locker.js pids/locker.pid logs/locker.log
run_program messagebroker/messagebroker.js pids/messagebroker.pid logs/messagebroker.log
run_program bcmonitor/bcmonitor.js pids/bcmonitor.pid logs/bcmonitor.log
run_program bcmonitor/bcmonitorEth.js pids/bcmonitorEth.pid logs/bcmonitorEth.log
run_program bcmonitor/bcmonitorTri.js pids/bcmonitorTri.pid logs/bcmonitorTri.log
run_program emailservice/emailservice.js pids/emailservice.pid logs/emailservice.log
run_program pushnotificationsservice/pushnotificationsservice.js pids/pushnotificationsservice.pid logs/pushnotificationsservice.log
run_program fiatrateservice/fiatrateservice.js pids/fiatrateservice.pid logs/fiatrateservice.log
# run_program bws.js pids/bws.pid logs/bws.log trace
run_program bws.js pids/bws.pid logs/bws.log

