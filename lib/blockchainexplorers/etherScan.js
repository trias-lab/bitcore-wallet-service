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

const TIMEOUT_MS = 5000

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
          this.apis = apiKey
      } else {
          this.apis  = [apiKey]
      }
  }
}

var apiIndex = 0;

EtherScan.prototype.getApiKey = function () {
    if (apiIndex >= this.apis.length) {
        apiIndex = 0;
    }
    return this.apis[apiIndex]
}

EtherScan.prototype.getConnectionInfo = function() {
  return 'EtherScan (' + this.coin + '/' + this.network + ') @ ';
};


function makeGetRequest(path, callback) {
    var opt = {
        method: "GET",
        host: "api-ropsten.etherscan.io",
        port: 80,
        path: path,
        timeout: TIMEOUT_MS,
    };

    var newReq = http.request(opt, function(newRes){
        if(newRes.statusCode === 200){
            newRes.setEncoding('utf8');
            var body = "";
            newRes.on('data', function(recData){
                body += recData;
            });
            newRes.on('end', function(){
                var obj;
                try {
                    obj = JSON.parse(body);
                } catch (e) {
                    return callback(path + 'parse json error ' + e + ',' + body);
                }
                callback(null, obj);
            });
        } else {
            callback(path + ', status:' + newRes.statusCode)
        }
    });
    newReq.on('error', (e) => {
        callback(path + ': error ' + e)
    });
    newReq.on('timeout', () => {
        newReq.abort();
    });
    newReq.on('socket', function (socket) {
        socket.setTimeout(TIMEOUT_MS);
        socket.on('timeout', function() {
            newReq.abort();
        });
    });
    newReq.end();
}

/**
 * Broadcast a transaction to the bitcoin network
 */
EtherScan.prototype.broadcast = function(rawTx, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=proxy&action=eth_sendRawTransaction&hex=' + rawTx + '&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            cb(null, obj.result);
        }
    })
};

EtherScan.prototype.getTransaction = function(txid, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=proxy&action=eth_getTransactionByHash&txhash=' + txid + '&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            cb(null, obj.result);
        }
    })
};

EtherScan.prototype.getAddressActivity = function(address, cb) {
    //tmp
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=account&action=balance&address=' + address + '&tag=latest&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            var number = parseInt(obj.result)
            return cb(null, number>0);
        }
    })
};

EtherScan.prototype.getBlockchainHeight = function(cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=proxy&action=eth_blockNumber&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            var height = parseInt(obj.result, 16);
            return cb(null, height);
        }
    })
};

EtherScan.prototype.getBlockchainData = function(blockHeight, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var hex = '0x' + blockHeight.toString(16);
    var path = '/api?module=proxy&action=eth_getBlockByNumber&tag=' + hex + '&boolean=true&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            return cb(null, obj.result);
        }
    })
};

EtherScan.prototype.getAddressBalance = function(address, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=account&action=balance&address=' + address + '&tag=latest&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            var number = parseInt(obj.result)
            return cb(null, number);
        }
    })
};

EtherScan.prototype.getMultiAddressBalance = function(addressArray, cb) {
    var self = this;
    var queryGroups = [];
    var s = '';
    for(var i=0; i<addressArray.length; i++) {
        if (i && ((i%10)===0)) {
            s = s.substr(0, s.length - 1);
            queryGroups.push(s);
            s = addressArray[i] + ',';
        } else {
            s += addressArray[i] + ',';
        }
    }
    s = s.substr(0, s.length - 1);
    queryGroups.push(s);
    //log.info('getMultiAddressBalance group ' + queryGroups);

    var resultMap = {};
    async.eachSeries(queryGroups, function(queryGroup, next) {
        var apiKey = self.getApiKey();
        var path = '/api?module=account&action=balancemulti&address=' + queryGroup + '&tag=latest&apikey=' + apiKey;
        makeGetRequest(path, function (err, obj) {
            if (err) {
                log.error('getMultiAddressBalance, http error', err, path);
                return next(new Error(err));
            } else {
                if (!obj || !obj.result) {
                    return next(new Error('getMultiAddressBalance json parse error'));
                }
                var array = obj.result;
                for (var j = 0; j < array.length; j++) {
                    var balance = parseInt(array[j].balance);
                    if (isNaN(balance)) {
                        log.error('getMultiAddressBalance request balance parse error ' + array[j].balance);
                        balance = 0;
                    }
                    resultMap[array[j].account] = parseInt(balance);
                }
                return next();
            }
        });

    }, function(err){
        if (err) {
            log.error('etherscan getMultiAddressBalance error ' + err);
            return cb(err, []);
        } else {
            var finalResult = [];
            for(var k=0; k<addressArray.length; k++) {
                var address = addressArray[k];

                if (resultMap[address] === undefined || isNaN(resultMap[address])) {
                    log.info('etherscan getMultiAddressBalance， resultMap missing address ' + address + ', resultMap=' + resultMap);
                    return cb(new Error('etherscan getMultiAddressBalance error'));
                }
                finalResult.push( resultMap[address] );
            }
            //log.info('etherscan getMultiAddressBalance result = ' + finalResult);
            return cb(null, finalResult);
        }
    });
};

EtherScan.prototype.getAddressTransactionCount = function(address, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=proxy&action=eth_getTransactionCount&address=' + address + '&tag=latest&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            var number = parseInt(obj.result)
            return cb(null, number);
        }
    })
};

EtherScan.prototype.getTxList = function(address, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=account&action=txlist&address=' + address + '&startblock=0&endblock=99999999&sort=asc&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            cb(err);
        } else {
            return cb(null, obj.result);
        }
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
                var balance = parseInt(balanceArray[i].balance);
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
        bitTx.confirmations = (ethTx.confirmations > 10) ? ethTx.confirmations : 10;
        bitTx.time = ethTx.timeStamp;
        bitTx.blocktime = ethTx.timeStamp;
        bitTx.valueOut = ethTx.value;
        bitTx.size = 225;
        bitTx.valueIn = parseInt(ethTx.value) + realFee;
        bitTx.fees = realFee / (10 ** 18);
        bitTx.transactionIndex = ethTx.transactionIndex;
        return bitTx;
    }

    function getAddressTx(address, next) {
        log.info('getTransactions start, address ' + address + ', seconds=' + parseInt(new Date().getTime()/1000));
        self.getTxList(address, function (err, ethTxs) {
            if(err) {
                log.info('get txlist fail, address ' + address + ', api index ' + (apiIndex-1) + ', err:' + err);
                return next(err);

            } else {
                for(var i=0; i<ethTxs.length; i++) {
                    (function (index) {
                        var ethTx = ethTxs[index];
                        ethTx.from = new ethCoin.Address(ethTx.from).toString();
                        ethTx.to = new ethCoin.Address(ethTx.to).toString();
                        var bitTx = ethTxToBitTx(ethTx);
                        result.push(bitTx);
                        storage.updateETHTxHistoryGasUsed(ethTx, function (err) {
                            if (err) {
                                log.error('etherscan updateETHTxHistoryGasUsed error ' + err);
                            }
                        });
                    })(i);
                }
                log.info('get txlist success, address ' + address);
                return next();
            }
        });
    }

    //check if missing tx history
    function checkIfMissingHistory() {
        storage.getEthHistoryUpdateTs(walletId, function (err, ts) {
            if (err) {
                log.error('getEthHistoryUpdateTs err');
                return;
            }
            var now = new Date().getTime();
            var interval = 0;
            if (ts) {
                interval = (now - parseInt(ts)) / 1000;
            }
            log.info('getTransactions eth history update interval ' + interval + ' seconds, last update ts ' + ts);

            var hour = 2;
            if (!ts || interval > 60 * 60 * hour) { //not use db(now-parseInt(ts))
                var first = true;
                async.eachSeries(addresses, function (address, next) {
                    var delay;
                    if (first) {
                        first = false;
                        delay = 0;
                    } else {
                        delay = 1 * 1000;
                    }
                    setTimeout(function () {
                        getAddressTx(address, next);
                    }, delay);

                }, function (err) {
                    if (err) {
                        log.error('etherscan getTransactions finish, error ' + err);
                        return;
                    } else {
                        var seq = _.sortBy(result, [function (tx) {
                            var index = -(tx.blockheight + tx.transactionIndex * 0.0001);
                            return index;
                        }]);

                        log.info('etherscan getTransactions finish, result = ' + seq);
                        now = new Date().getTime();
                        storage.storetEthHistoryUpdateTs(walletId, now, function (err) {
                            if (err) {
                                log.error('etherscan storetEthHistoryUpdateTs error ' + err);
                                return;
                            }
                            return;
                        });
                    }
                });
            }
        });
    }
    setTimeout(checkIfMissingHistory, 10*1000);

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
