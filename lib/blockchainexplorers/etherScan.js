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
var ethCoin = require('bitcore-lib-eth');

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
      if (_.isArray(apiKey)) {
          this.apis = _.map(apiKey, function (key) {
            return  require('etherscan-api').init(key,'ropsten');
          });
      } else {
          this.apis  = []
          this.apis[0] = require('etherscan-api').init(apiKey,'ropsten');
      }
  }
}

var apiIndex = 0;
EtherScan.prototype.getApi = function () {
    if (apiIndex >= this.apis.length) {
        apiIndex = 0;
    }
    return this.apis[apiIndex++];
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
  var hash = this.getApi().proxy.eth_sendRawTransaction(rawTx);
  hash.then(function (data) {
        return cb(null, data.result);
  }).catch(function(err){
        return cb(_parseErr(err));
  });
};

EtherScan.prototype.getTransaction = function(txid, cb) {
  var tx = this.getApi().proxy.eth_getTransactionByHash( txid );
  tx.then(function (data) {
        return cb(null, data.result);
  }).catch(function(err){
        return cb(_parseErr(err));
  });
};

EtherScan.prototype.getAddressActivity = function(address, cb) {
    //tmp
    var balance = this.getApi().account.balance( address );
    balance.then(function (data) {
        var number = parseInt(data.result)
        return cb(null, number>0);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getBlockchainHeight = function(cb) {
  var blockNum = this.getApi().proxy.eth_blockNumber();
  blockNum.then(function (data) {
        var height = parseInt(data.result, 16);
        return cb(null, height);
   }).catch(function(err){
        return cb(_parseErr(err));
   });
};

EtherScan.prototype.getBlockchainData = function(blockHeight, cb) {
    var hex = '0x' + blockHeight.toString(16);
    var blockData = this.getApi().proxy.eth_getBlockByNumber(hex);
    blockData.then(function (data) {
        return cb(null, data.result);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getAddressBalance = function(address, cb) {
    var balance = this.getApi().account.balance( address );
    balance.then(function (data) {
        var number = parseInt(data.result)
        return cb(null, number);
    }).catch(function(err){
        return cb(_parseErr(err));
    });
};

EtherScan.prototype.getAddressTransactionCount = function(address, cb) {
    var count = this.getApi().proxy.eth_getTransactionCount( address );
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
            callback(err);
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
    var self = this;
    var result = [];

    function getAddressTx(address, next) {
        log.info('getTransactions start, address ' + address + ', seconds=' + parseInt(new Date().getTime()/1000));
        var tx = self.getApi().account.txlist( address );
        tx.then(function (data) {
            var ethTxs = data.result;
            for(var i=0; i<ethTxs.length; i++) {
                var ethTx = ethTxs[i];
                var realFee = parseInt(ethTx.gasPrice) * parseInt(ethTx.gasUsed);
                var bitTx = {};
                bitTx.txid = ethTx.hash;
                bitTx.version = 1;
                bitTx.locktime = 0;
                bitTx.vin = [{}];
                bitTx.vin[0].addr = new ethCoin.Address(ethTx.from).toString();
                bitTx.vin[0].valueSat = parseInt(ethTx.value) + realFee;
                bitTx.vout = [{
                    scriptPubKey:{
                        addresses:[]
                    }
                }];
                bitTx.vout[0].scriptPubKey.addresses[0] = new ethCoin.Address(ethTx.to).toString();
                bitTx.vout[0].value = parseInt(ethTx.value);
                bitTx.blockheight = parseInt(ethTx.blockNumber);
                bitTx.blockhash = ethTx.blockHash;
                bitTx.confirmations = ethTx.confirmations;
                bitTx.time = ethTx.timeStamp;
                bitTx.blocktime = ethTx.timeStamp;
                bitTx.valueOut = ethTx.value;
                bitTx.size = 225;
                bitTx.valueIn = parseInt(ethTx.value) + realFee;
                bitTx.fees = realFee / (10 ** 18);
                result.push(bitTx);
            }
            log.info('get txlist success, address ' + address);
            next();
        }).catch(function(err){
            log.info('get txlist fail, address ' + address + ', api index ' + (apiIndex-1) + ', err:' + err);
            if (err === 'NOTOK') {
                next();
            } else {
                next(err);
            }
        });
    }

    var first = true;
    async.eachSeries(addresses, function (address, next) {
        var delay;
        if (first) {
            first = false;
            delay = 0;
        } else {
            delay = 0.2 * 1000;
        }
        setTimeout(function () {
            getAddressTx(address, next);
        }, delay);

    }, function(err){
        if (err) {
            log.error('etherscan getTransactions finish, error ' + err);
            return cb(err, [], 0);
        } else {
            log.info('etherscan getTransactions finish, result = ' + result);
            return cb(null, result, result.length);
        }
    });
};

module.exports = EtherScan;
