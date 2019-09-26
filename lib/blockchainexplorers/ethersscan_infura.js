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
var request = require('request');
var http = require('http');
var Web3 = require("web3");

const TIMEOUT_MS = 5000

function EtherScan(opts) {
  $.checkArgument(opts);
  $.checkArgument(Utils.checkValueInCollection(opts.network, Constants.NETWORKS));
  $.checkArgument(Utils.checkValueInCollection(opts.coin, Constants.COINS));
  //$.checkArgument(opts.url);

  this.coin = opts.coin || 'eth';
  this.network = opts.network || 'livenet';
  this.userAgent = opts.userAgent || 'bws';
  this.web3 = new Web3();
  const IS_TEST = true
  let provider;
  var ContractAddress;
  if (IS_TEST) {
    //测试配置
    this.web3.setProvider(new Web3.providers.HttpProvider("https://ropsten.infura.io/v3/7d0d81d0919f4f05b9ab6634be01ee73"))
    ContractAddress = "0xe906c9fa6c5239e9ea8a9bb2ff656e146ff5142c"
  } else {
    //正式配置
    this.web3.setProvider(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/7d0d81d0919f4f05b9ab6634be01ee73"))
    //TRY 币合约地址 https://etherscan.io/token/0xe431a4c5db8b73c773e06cf2587da1eb53c41373
    ContractAddress = "0xe431a4c5db8b73c773e06cf2587da1eb53c41373"
  }
}

EtherScan.prototype.getConnectionInfo = function() {
  return 'EtherScan (' + this.coin + '/' + this.network + ') @ ';
};

/**
 * Broadcast a transaction to the bitcoin network
 */
EtherScan.prototype.broadcast = function(rawTx, cb) {
  if (rawTx[1] !== 'x' && rawTx[1] !== 'X') {
    rawTx = '0x' + rawTx
  }
  if (this.web3.eth.sendSignedTransaction) {
    this.web3.eth.sendSignedTransaction(rawTx)
      .on('transactionHash', function (hash) {
        log.info('eth broadcast result ' + hash)
        cb(null, hash);
      })
      .on('error', function (error) {
        log.info('eth broadcast error ' + error)
        cb(error);
      });
  } else {
    this.web3.eth.sendRawTransaction(rawTx)
      .on('transactionHash', function (hash) {
        log.info('eth broadcast result ' + hash)
        cb(null, hash);
      })
      .on('error', function (error) {
        log.info('eth broadcast error ' + error)
        cb(error);
      });
  }
};

EtherScan.prototype.getTransaction = function(txid, cb) {
  this.web3.eth.getTransaction(txid)
    .then(function (obj) {
      return cb(null, obj);
    })
    .catch(function (err) {
      return cb(err);
    })
};

EtherScan.prototype.getAddressActivity = function(address, cb) {
  var self = this
  this.web3.eth.getBalance(address)
    .then(function (amount) {
      var number = parseInt(amount)
      if (number > 0) {
        return true
      } else {
        return self.web3.eth.getTransactionCount(address)
      }
    })
    .then(function (result) {
      if (result === true) { //number > 0
        return cb(null, true)
      } else { //transaction count
        if (parseInt(result) > 0) {
          return cb(null, true);
        } else {
          return cb(null, false);
        }
      }
    })
    .catch(function (err) {
      return cb(err)
    })
};

EtherScan.prototype.getBlockchainHeight = function(cb) {
  this.web3.eth.getBlockNumber()
    .then(function (height) {
      return cb(null, height);
    })
    .catch(function (err) {
      log.error('EtherScan getBlockchainHeight err', err)
      return cb(err)
    })
};

EtherScan.prototype.getBlockchainData = function(blockHeight, cb) {
  this.web3.eth.getBlock(blockHeight, true)
    .then(function (block) {
      return cb(null, block)
    })
    .catch(function (err) {
      return cb(err)
    })
};

EtherScan.prototype.getAddressBalance = function(address, cb) {
  this.web3.eth.getBalance(address)
    .then(function (amount) {
      return cb(null, parseInt(amount));
    })
    .catch(function (err) {
      return cb(err)
    })
};

EtherScan.prototype.getMultiAddressBalance = function(addressArray, cb) {
  var self = this;
  var result = [];
  async.eachSeries(addressArray, function(address, callback) {
    self.getAddressBalance(address, function (err, balance) {
      result.push(balance)
      callback(err);
    });
  }, function(err){
    if (err) {
      log.error('eth getAddressBalance error ' + err);
      return cb(err, []);
    } else {
      //log.info('etherscan getUtxos result = ' + result);
      return cb(null, result);
    }
  });
};

EtherScan.prototype.getAddressTransactionCount = function(address, cb) {
  this.web3.eth.getTransactionCount(address)
    .then(function (count) {
      return cb(null, parseInt(count));
    })
    .catch(function (err) {
      var info = "获取ETH地址信息失败，请稍后再试"
      cb(info);
    })
};

EtherScan.prototype.getUtxos1 = function(addresses, cb, walletId) {
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
        obj.amount = (balance / (10 ** 18)).toFixed(18);
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
      //log.info('etherscan getUtxos result = ' + result);
      return cb(null, result);
    }
  });
}

EtherScan.prototype.getUtxos = function(addresses, cb, walletId, storage) {
  var self = this;

  function updateLocalCache() {
    self.getMultiAddressBalance(addresses, function (err, balanceArray) {
      if (err) {
        log.error('getUtxos getMultiAddressBalance error ' + err);
        return;
      } else {
        for(var i=0; i<balanceArray.length; i++) {
          var address = addresses[i];
          var balance = balanceArray[i];
          storage.updateEthBalanceCacheSingle(address, balance, function (err, result) {
            if (err) {
              log.info('updateEthBalanceCacheSingle err', err);
              return;
            }
          });
        }
        //log.info('etherscan getUtxos result = ' + result);
        return;
      }
    });
  }

  setTimeout(updateLocalCache, 2*1000);

  var result = [];
  storage.getEthBalanceCacheMulti(addresses, function (err, balanceArray) {
    if (err) {
      log.error('getUtxos getEthBalanceCacheMulti error ' + err);
      return cb(err, []);
    } else {
      for(var i=0; i<balanceArray.length; i++) {
        var address = balanceArray[i].address;
        var balance = balanceArray[i].balance;
        if (balance > 0) {
          var obj = {};
          obj.txid = address.substring(2);
          obj.vout = 0;
          obj.address = address;
          obj.scriptPubKey = 'OP_DUP OP_HASH160 20 0x0000000000000000000000000000000000000000 OP_EQUALVERIFY OP_CHECKSIG';
          obj.amount = (balance / (10 ** 18)).toFixed(18);
          obj.satoshis = balance;
          obj.confirmations = 10;
          result.push(obj);
        }
      }
      //log.info('etherscan getUtxos result = ' + result);
      return cb(null, result);
    }
  });
}

EtherScan.prototype.getTransactions = function(addresses, from, to, cb, walletId, storage) {
  var self = this;
  var result = [];

  function  ethTxToBitTx(ethTx) {
    var realFee = parseInt(ethTx.gasPrice) * parseInt(ethTx.gasUsed || ethTx.gas);
    var bitTx = {};
    bitTx.txid = ethTx.hash;
    bitTx.version = 1;
    bitTx.locktime = 0;
    bitTx.vin = [{}];
    bitTx.vin[0].addr = new ethCoin.Address(ethTx.from).toString();
    bitTx.vin[0].valueSat = ethTx.value + realFee;
    bitTx.vout = [{
      scriptPubKey:{
        addresses:[]
      }
    }];
    bitTx.vout[0].scriptPubKey.addresses[0] = new ethCoin.Address(ethTx.to).toString();
    bitTx.vout[0].value = ethTx.value;
    bitTx.blockheight = parseInt(ethTx.blockNumber);
    bitTx.blockhash = ethTx.blockHash;
    bitTx.confirmations = (ethTx.confirmations > 10) ? ethTx.confirmations : 10;
    bitTx.time = ethTx.timeStamp;
    bitTx.blocktime = ethTx.timeStamp;
    bitTx.valueOut = ethTx.value;
    bitTx.size = 225;
    bitTx.valueIn = ethTx.value + realFee;
    bitTx.fees = realFee / (10 ** 18);
    bitTx.transactionIndex = ethTx.transactionIndex;
    return bitTx;
  }
  /*
  var lowcaseAddressArray = _.map(addresses, function (address) {
      return address.toLowerCase();
  });
  */
  storage.batchGetETHTxHistory(addresses, function (err, txArray) {
    if (err) {
      log.error('batchGetETHTxHistory err ' + err);
      return cb(err, [], 0);
    }
    if (!txArray.length) {
      return cb(null, [], 0);
    }
    for(var i=0; i<txArray.length; i++) {
      var ethTx = txArray[i];
      var bitTx = ethTxToBitTx(ethTx);
      result.push(bitTx);
    }
    var seq = _.sortBy(result, [function(tx) {
      var index = -(tx.blockheight + tx.transactionIndex * 0.0001);
      return index;
    }]);

    //log.info('batchGetETHTxHistory finish, result = ' + seq);
    return cb(null, seq, seq.length);

  });
};

module.exports = EtherScan;
