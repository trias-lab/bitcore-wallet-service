#!/usr/bin/env node

'use strict';

var _ = require('lodash');
var log = require('npmlog');
log.debug = log.verbose;

var config = require('../config');
var BlockchainMonitor = require('../lib/blockchainmonitorEth');

if (_.isEmpty(config.eth) || _.isEmpty(config.eth.EtherScanApiKey)) {
  console.log('not find ether scan api key');
  return;
}
var bcm = new BlockchainMonitor();
bcm.start(config, function(err) {
  if (err) throw err;

  console.log('Blockchain monitor Eth started');
});
