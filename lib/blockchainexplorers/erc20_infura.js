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
const erc20_abi = require('./erc20_abi.json')

const TIMEOUT_MS = 5000

function Erc20(opts) {
  $.checkArgument(opts);
  $.checkArgument(Utils.checkValueInCollection(opts.network, Constants.NETWORKS));
  $.checkArgument(Utils.checkValueInCollection(opts.coin, Constants.COINS));
  //$.checkArgument(opts.url);

  this.coin = opts.coin || 'try';
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
  this.ContractAddress = ContractAddress;
  this.contract = new this.web3.eth.Contract(erc20_abi, this.ContractAddress)
}


Erc20.prototype.getConnectionInfo = function() {
  return 'Erc20 (' + this.coin + '/' + this.network + ') @ ';
};

/**
 * Broadcast a transaction to the bitcoin network
 */
Erc20.prototype.broadcast = function(rawTx, cb) {
  if (rawTx[1] !== 'x' && rawTx[1] !== 'X') {
    rawTx = '0x' + rawTx
  }
  if (this.web3.eth.sendSignedTransaction) {
    this.web3.eth.sendSignedTransaction(rawTx)
      .on('transactionHash', function (hash) {
        log.info('erc20 broadcast result ' + hash)
        cb(null, hash);
      })
      .on('error', function (error) {
        log.info('erc20 broadcast error ' + error)
        var info = "发送失败，请检查账户的ETH余额，ETH余额需要大于交易的手续费。"
        cb(error);
      });
  } else {
    this.web3.eth.sendRawTransaction(rawTx)
      .on('transactionHash', function (hash) {
        log.info('erc20 broadcast result ' + hash)
        cb(null, hash);
      })
      .on('error', function (error) {
        log.info('erc20 broadcast error ' + error)
        var info = "发送失败，请检查账户的ETH余额，ETH余额需要大于交易的手续费。"
        cb(error);
      });
  }
};

Erc20.prototype.getTransaction = function(txid, cb) {
  this.web3.eth.getTransaction(txid)
    .then(function (obj) {
      return cb(null, obj);
    })
    .catch(function (err) {
      return cb(err);
    })
};

Erc20.prototype.getAddressActivity = function(address, cb) {
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

Erc20.prototype.getBlockchainHeight = function(cb) {
  this.web3.eth.getBlockNumber()
    .then(function (height) {
      return cb(null, height);
    })
    .catch(function (err) {
      return cb(err)
    })
};

Erc20.prototype.getBlockchainData = function(blockHeight, cb) {
 this.web3.eth.getBlock(blockHeight, true)
   .then(function (block) {
     return cb(null, block)
   })
   .catch(function (err) {
     return cb(err)
   })
};

Erc20.prototype.getBlockchainDataOnlyHeader = function(blockHeight, cb) {
  this.web3.eth.getBlock(blockHeight, false)
    .then(function (block) {
      return cb(null, block)
    })
    .catch(function (err) {
      return cb(err)
    })
};

Erc20.prototype.getAddressBalance = function(address, cb) {
  this.contract.methods.balanceOf(address).call({})
    .then(function (value) {
      return cb(null, parseFloat(value));
    })
    .catch(function (err) {
      return cb(err, 0);
    })
};

Erc20.prototype.getMultiAddressBalance = function(addressArray, cb) {
  var self = this;
  var result = [];
  async.eachSeries(addressArray, function(address, callback) {
    self.getAddressBalance(address, function (err, balance) {
      result.push(balance)
      callback(err);
    });
  }, function(err){
    if (err) {
      log.error('erc20 getAddressBalance error ' + err);
      return cb(err, []);
    } else {
      //log.info('etherscan getUtxos result = ' + result);
      return cb(null, result);
    }
  });
};

Erc20.prototype.getAddressTransactionCount = function(address, cb) {
  this.web3.eth.getTransactionCount(address)
    .then(function (count) {
      return cb(null, parseInt(count));
    })
    .catch(function (err) {
      var info = "获取ETH地址信息失败，请稍后再试"
      cb(info);
    })
};

Erc20.prototype.getEventsAndHeaderInBlock = function(height, cb) {
  var self = this
  this.contract.getPastEvents('Transfer', {
    fromBlock: height,
    toBlock: height
  })
    .then(function(events){
      if (events && events.length) {
        return self.getBlockchainDataOnlyHeader(height, function (err, blockHeader) {
          if (err) {
            log.error('getBlockchainDataOnlyHeader err', err)
            return cb(err)
          } else {
            return cb(null, events, blockHeader)
          }
        })
      } else {
        return cb(null, events)
      }
    })
    .catch(function (err) {
      log.error('getEventsAndHeaderInBlock err', err)
      return cb(err)
    })
}

Erc20.prototype.getUtxos = function(addresses, cb, walletId, storage) {
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
          storage.updateTRYBalanceCacheSingle(address, balance, function (err, result) {
            if (err) {
              log.info('updateTRYBalanceCacheSingle err', err);
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
  storage.getTRYBalanceCacheMulti(addresses, function (err, balanceArray) {
    if (err) {
      log.error('getUtxos getTRYBalanceCacheMulti error ' + err);
      return cb(err, []);
    } else {
      for(var i=0; i<balanceArray.length; i++) {
        var address = balanceArray[i].address;
        var balance = parseFloat(balanceArray[i].balance);
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
          log.info("erc20 utxo amount", obj.amount, "balance", balance)
        }
      }
      //log.info('etherscan getUtxos result = ' + result);
      return cb(null, result);
    }
  });
}

Erc20.prototype.getTransactions = function(addresses, from, to, cb, walletId, storage) {
  var self = this;
  var result = [];

  function  ethTxToBitTx(ethTx) {
    var bitTx = {};
    bitTx.txid = ethTx.hash;
    bitTx.version = 1;
    bitTx.locktime = 0;
    bitTx.vin = [{}];
    bitTx.vin[0].addr = new ethCoin.Address(ethTx.from).toString();
    bitTx.vin[0].valueSat = ethTx.value;
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
    bitTx.valueIn = ethTx.value;
    bitTx.fees = 0;
    bitTx.transactionIndex = ethTx.transactionIndex;
    return bitTx;
  }

  /*
  var lowcaseAddressArray = _.map(addresses, function (address) {
      return address.toLowerCase();
  });
  */
  storage.batchGetTRYTxHistory(addresses, function (err, txArray) {
    if (err) {
      log.error('batchGetTRYTxHistory err ' + err);
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

module.exports = Erc20;
