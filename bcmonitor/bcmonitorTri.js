#!/usr/bin/env node

'use strict';

var _ = require('lodash');
var log = require('npmlog');
log.debug = log.verbose;

var config = require('../config');
var BlockchainMonitor = require('../lib/blockchainmonitorTri');

if (_.isEmpty(config.tri) || _.isEmpty(config.tri.url)) {
  console.log('not find tri node url');
  return;
}
var bcm = new BlockchainMonitor();
bcm.start(config, function(err) {
  if (err) throw err;

  console.log('Blockchain monitor Tri started');
});
