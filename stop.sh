#!/bin/bash

stop_program ()
{
  pidfile=$1

  echo "Stopping Process - $pidfile. PID=$(cat $pidfile)"
  kill -9 $(cat $pidfile)
  rm $pidfile
  
}

stop_program pids/bws.pid
stop_program pids/fiatrateservice.pid
stop_program pids/emailservice.pid
stop_program pids/bcmonitorBtc.pid
stop_program pids/bcmonitorEth.pid
stop_program pids/bcmonitorTry.pid
stop_program pids/pushnotificationsservice.pid
stop_program pids/messagebroker.pid
stop_program pids/locker.pid

