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
var triCoin = require('bitcore-lib-tri');
var request = require('request');
var Web3 = require('web3');
var web3;

function TriRpc(opts) {
  $.checkArgument(opts);
  $.checkArgument(Utils.checkValueInCollection(opts.network, Constants.NETWORKS));
  $.checkArgument(Utils.checkValueInCollection(opts.coin, Constants.COINS));
  //$.checkArgument(opts.url);

  this.coin = opts.coin || 'tri';
  this.network = opts.network || 'livenet';
  this.userAgent = opts.userAgent || 'bws';
  var url = config.tri.url;
  if (this.network === 'livenet') {
     web3 =  new Web3(url);
  }
}

var _parseErr = function(err, prefix) {
  if (err) {
    log.warn('TriRpc error: ' + err + (prefix ? prefix : ''));
    return 'tri Error ' + err;
  }
  return err;
};

TriRpc.prototype.getConnectionInfo = function() {
  return 'TriRpc (' + this.coin + '/' + this.network + ') @ ';
};

/**
 * Broadcast a transaction to the bitcoin network
 */
TriRpc.prototype.broadcast = function(rawTx, cb) {
    web3.eth.sendSignedTransaction(rawTx)
    .once('transactionHash', function(hash){
        return cb(null, hash);
    })
    .once('error', function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getTransaction = function(txid, cb) {
    var tx = web3.eth.getTransaction( txid  );
    tx.then(function (data) {
        return cb(null, data);
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getAddressActivity = function(address, cb) {
    //tmp
    var balance = web3.eth.getBalance( address );
    balance.then( function (balanceData) {
        var number = parseInt(balanceData)
        return cb(null, number>0);
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getBlockchainHeight = function(cb) {
    var blockNum = web3.eth.getBlockNumber();
    blockNum.then(function (data) {
        var height = parseInt(data);
        return cb(null, height);
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getBlockchainData = function(blockHeight, cb) {
    var block = web3.eth.getBlock( blockHeight, true );
    block.then(function (data) {
        return cb(null, data);
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getBlockTransactionCount = function(blockHeight, cb) {
    var count = web3.eth.getBlockTransactionCount( blockHeight );
    count.then(function (data) {
        return cb(null, parseInt(data));
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getAddressBalance = function(address, cb) {
    var balance = web3.eth.getBalance( address );
    balance.then( function (balanceData) {
        var number = parseInt(balanceData)
        return cb(null, number);
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getAddressTransactionCount = function(address, cb) {
    var count = web3.eth.getTransactionCount( address );
    count.then(function (data) {
        var number = parseInt(data)
        return cb(null, number);
    }).catch( function(error){
        return cb(_parseErr(error));
    });
};

TriRpc.prototype.getMultiAddressBalance = function(addressArray, cb) {
    var self = this;
    var queryGroups = [];
    var s = [];
    var max = 20;
    for(var i=0; i<addressArray.length; i++) {
        if (i && ((i%max)===0)) {
            queryGroups.push(s);
            s = [];
        } else {
            s.push(addressArray[i]);
        }
    }
    queryGroups.push(s);
    //log.info('getMultiAddressBalance group ' + queryGroups);

    var resultMap = {total : 0};
    async.eachSeries(queryGroups, function(queryGroup, next) {
        var batch = new web3.BatchRequest();
        for(var i=0; i<queryGroup.length; i++) {
            (function(address) {
                batch.add(web3.eth.getBalance.request(address, 'latest', function (err, balance) {
                    if (err) {
                        log.error('getMultiAddressBalance request getBalance error ' + err);
                        resultMap[address] = 0;
                    } else {
                        resultMap[address] = parseInt(balance);
                    }
                    resultMap.total++;
                    if (resultMap.total === queryGroup.length) {
                        return next();
                    }
                }));
            })(queryGroup[i]);
        }
        batch.execute();

    }, function(err){
        if (err) {
            log.error('tri getMultiAddressBalance error ' + err);
            return cb(err, []);
        } else {
            var finalResult = [];
            for(var k=0; k<addressArray.length; k++) {
                var address = addressArray[k];

                if (resultMap[address] === undefined || isNaN(resultMap[address])) {
                    log.info('tri getMultiAddressBalance， resultMap missing address ' + address + ', resultMap=' + resultMap);
                    return cb(new Error('tri getMultiAddressBalance error'));
                }
                finalResult.push( resultMap[address] );
            }
            log.info('tri getMultiAddressBalance result = ' + finalResult);
            return cb(null, finalResult);
        }
    });
};

TriRpc.prototype.getUtxos = function(addresses, cb, walletId) {
    var self = this;
    var result = [];
    self.getMultiAddressBalance(addresses, function (err, balanceArray) {
        if (err) {
            log.error('tri getUtxos error ' + err);
            return cb(err, []);
        } else {
            for(var i=0; i<balanceArray.length; i++) {
                var address = addresses[i];
                var balance = balanceArray[i];
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
            }
            log.info('tri getUtxos result = ' + result);
            return cb(null, result);
        }
    });
}

TriRpc.prototype.getTransactions = function(addresses, from, to, cb, walletId, storage) {
    var self = this;
    /*
    var lowcaseAddressArray = _.map(addresses, function (address) {
       return address.toLowerCase();
    });
    */
    var result = [];
    storage.batchGetTriTxHistory(addresses, function (err, txArray) {
        if (err) {
            log.error('batchGetTriTxHistory err ' + err);
            return cb(null, [], 0);;
        }
        for(var i=0; i<txArray.length; i++) {
            var triTx = txArray[i];
            var realFee = parseInt(triTx.gasPrice) * 21000;
            var bitTx = {};
            bitTx.txid = triTx.hash;
            bitTx.version = 1;
            bitTx.locktime = 0;
            bitTx.vin = [{}];
            bitTx.vin[0].addr = new triCoin.Address(triTx.from).toString();
            bitTx.vin[0].valueSat = parseInt(triTx.value) + realFee;
            bitTx.vout = [{
                scriptPubKey: {
                    addresses: []
                }
            }];
            bitTx.vout[0].scriptPubKey.addresses[0] = new triCoin.Address(triTx.to).toString();
            bitTx.vout[0].value = parseInt(triTx.value);
            bitTx.blockheight = parseInt(triTx.blockNumber);
            bitTx.blockhash = triTx.blockHash;
            bitTx.confirmations = triTx.confirmations;
            bitTx.time = triTx.timeStamp;
            bitTx.blocktime = triTx.timeStamp;
            bitTx.valueOut = triTx.value;
            bitTx.size = 225;
            bitTx.valueIn = parseInt(triTx.value) + realFee;
            bitTx.fees = realFee / (10 ** 18);
            bitTx.transactionIndex = triTx.transactionIndex;
            result.push(bitTx);
        }
        var seq = _.sortBy(result, [function(tx) {
            var index = -(tx.blockheight + tx.transactionIndex * 0.0001);
            return index;
        }]);

        log.info('batchGetTriTxHistory finish, result = ' + seq);
        return cb(null, seq, seq.length);
        
    });
};

module.exports = TriRpc;
