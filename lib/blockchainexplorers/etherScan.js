'use strict';

var _ = require('lodash');
var async = require('async');
var $ = require('preconditions').singleton();
var log = require('npmlog');
log.debug = log.verbose;
var Common = require('../common');
var Constants = Common.Constants,
  Defaults = Common.Defaults,
  Utils = Common.Utils;
var config = require('../../config');

function EtherScan(opts) {
  $.checkArgument(opts);
  $.checkArgument(Utils.checkValueInCollection(opts.network, Constants.NETWORKS));
  $.checkArgument(Utils.checkValueInCollection(opts.coin, Constants.COINS));
  //$.checkArgument(opts.url);

  this.coin = opts.coin || 'eth';
  this.network = opts.network || 'livenet';
  this.userAgent = opts.userAgent || 'bws';
  var apiKey = config.eth.EtherScanApiKey;
  if (this.network === 'livenet') {
      //this.api = require('etherscan-api').init(apiKey);
      this.api = require('etherscan-api').init(apiKey,'ropsten');
  }
}

var _parseErr = function(err, prefix) {
  if (err) {
    log.warn('EtherScan error: ' + err + (prefix ? prefix : ''));
    return 'eth Error ' + err;
  }
  return err;
};


EtherScan.prototype.getConnectionInfo = function() {
  return 'EtherScan (' + this.coin + '/' + this.network + ') @ ';
};

/**
 * Broadcast a transaction to the bitcoin network
 */
EtherScan.prototype.broadcast = function(rawTx, cb) {
  var hash = this.api.proxy.eth_sendRawTransaction(rawTx);
  hash.then(function (data) {
        return cb(null, data.result);
  }).catch(function(err){
        return cb(_parseErr(err));
  });
};

EtherScan.prototype.getTransaction = function(txid, cb) {
  var tx = this.api.proxy.eth_getTransactionByHash( txid );
  tx.then(function (data) {
        return cb(null, data.result);
  }).catch(function(err){
        return cb(_parseErr(err));
  });
};

EtherScan.prototype.getAddressActivity = function(address, cb) {
    //tmp
    var balance = this.api.account.balance( address );
    balance.then(function (data) {
        var number = parseInt(data.result)
        return cb(null, number>0);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getBlockchainHeight = function(cb) {
  var blockNum = this.api.proxy.eth_blockNumber();
  blockNum.then(function (data) {
        var height = parseInt(data.result, 16);
        return cb(null, height);
   }).catch(function(err){
        return cb(_parseErr(err));
   });
};

EtherScan.prototype.getBlockchainData = function(blockHeight, cb) {
    var hex = '0x' + blockHeight.toString(16);
    var blockData = this.api.proxy.eth_getBlockByNumber(hex);
    blockData.then(function (data) {
        return cb(null, data.result);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getAddressBalance = function(address, cb) {
    var balance = this.api.account.balance( address );
    balance.then(function (data) {
        var number = parseInt(data.result)
        return cb(null, number);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getAddressTransactionCount = function(address, cb) {
    var count = this.api.proxy.eth_getTransactionCount( address );
    count.then(function (data) {
        var number = parseInt(data.result)
        return cb(null, number);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getUtxos = function(addresses, cb, walletId) {
    var self = this;
    var result = [];
    async.eachSeries(addresses, function(address, callback) {
        self.getAddressBalance(address, function (err, balance) {
            if (balance > 0) {
                var obj = {};
                obj.txid = address.substring(2);
                obj.vout = 0;
                obj.address = address;
                obj.scriptPubKey = 'OP_DUP OP_HASH160 20 0x0000000000000000000000000000000000000000 OP_EQUALVERIFY OP_CHECKSIG';
                obj.amount = parseFloat(balance / (10 ** 18)).toFixed(18);
                obj.satoshis = balance;
                obj.confirmations = 10;
                result.push(obj);
            }
            callback();
        });
    }, function(err){
        if (err) {
            log.error('etherscan getUtxos error ' + err);
            return cb(err, []);
        } else {
            log.info('etherscan getUtxos result = ' + result);
            return cb(null, result);
        }
    });
}


EtherScan.prototype.getTransactions = function(addresses, from, to, cb, walletId) {
    return cb(null, [], 0);
};
module.exports = EtherScan;
