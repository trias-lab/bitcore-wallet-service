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
const ethers = require('ethers');
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
    var apiKey = config.eth.EtherScanApiKey;
    if (this.network === 'livenet') {
        //this.api = require('etherscan-api').init(apiKey);
        if (_.isArray(apiKey)) {
            this.apis = apiKey
        } else {
            this.apis  = [apiKey]
        }
    }

    const IS_TEST = true
    let provider;
    var ContractAddress;
    if (IS_TEST) {
        //测试配置
        provider = ethers.getDefaultProvider('ropsten');
        ContractAddress = "0xe906c9fa6c5239e9ea8a9bb2ff656e146ff5142c"
    } else {
        //正式配置
        provider = ethers.getDefaultProvider('mainnet');
        //TRY 币合约地址 https://etherscan.io/token/0xe431a4c5db8b73c773e06cf2587da1eb53c41373
        ContractAddress = "0xe431a4c5db8b73c773e06cf2587da1eb53c41373"
    }

    //全局合约对象
    const contract = new ethers.Contract(ContractAddress, erc20_abi, provider);
    this.contract = contract;
    this.ContractAddress = ContractAddress;

}

var apiIndex = 0;

Erc20.prototype.getApiKey = function () {
    if (apiIndex >= this.apis.length) {
        apiIndex = 0;
    }
    return this.apis[apiIndex]
}

Erc20.prototype.getConnectionInfo = function() {
    return 'Erc20 (' + this.coin + '/' + this.network + ') @ ';
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
                    log.error('erc20 response format error', body, path)
                    return callback(path + 'parse json error ' + e + ',' + body);
                }
                if (obj.error && obj.error.message) {
                    log.error('erc20 response has error message', obj.error)
                    return callback(obj.error.message)
                }
                callback(null, obj);
            });
        } else {
            callback(path + ', status:' + newRes.statusCode)
        }
    });
    newReq.on('error', (e) => {
        log.error('erc20 req error', e, path)
        callback(path + ': error ' + e)
    });
    newReq.on('timeout', () => {
        log.error('erc20 req timeout', path)
        newReq.abort();
    });
    newReq.on('socket', function (socket) {
        socket.setTimeout(TIMEOUT_MS);
        socket.on('timeout', function() {
            log.error('erc20 socket timeout', path)
            newReq.abort();
        });
    });
    newReq.end();
}

/**
 * Broadcast a transaction to the bitcoin network
 */
Erc20.prototype.broadcast = function(rawTx, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '/api?module=proxy&action=eth_sendRawTransaction&hex=' + rawTx + '&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            log.info('erc20 broadcast error ' + err)
            var info = "发送失败，请检查账户的ETH余额，ETH余额需要大于交易的手续费。"
            cb(info);
        } else {
            log.info('erc20 broadcast result ' + obj.result)
            cb(null, obj.result);
        }
    })
};

Erc20.prototype.getTransaction = function(txid, cb) {
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

Erc20.prototype.getAddressActivity = function(address, cb) {
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

Erc20.prototype.getBlockchainHeight = function(cb) {
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

Erc20.prototype.getBlockchainData = function(blockHeight, cb) {
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

Erc20.prototype.getAddressBalance = function(address, cb) {
   this.contract.balanceOf(address).then(function(value) {
     return cb(null, parseFloat(value));
   }, function(err) {
     return cb(err, 0);
   });
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
    var self = this;
    var apiKey = self.getApiKey();

    var path = '/api?module=proxy&action=eth_getTransactionCount&address=' + address + '&tag=latest&apikey=' + apiKey
    makeGetRequest(path, function (err, obj) {
        if (err) {
            var info = "获取ETH地址信息失败，请稍后再试"
            cb(info);
        } else {
            var number = parseInt(obj.result)
            return cb(null, number);
        }
    })
};

Erc20.prototype.getTxList = function(address, cb) {
    var self = this;
    var apiKey = self.getApiKey();
    var path = '';
    path += "/api?module=account&action=tokentx&address="
    path += address
    path += "&contractaddress=" + this.ContractAddress
    path += "&startblock=0&endblock=999999999&sort=desc&apikey="
    path += apiKey

    makeGetRequest(path, function (err, obj) {
        if (err) {
            log.error('getTxList makeGetRequest err ' + err)
            return cb(err);
        } else {
            return cb(null, obj.result);
        }
    })
};

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
        var realFee = parseFloat(ethTx.gasPrice) * parseFloat(ethTx.gasUsed || ethTx.gas);
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
                if (!ethTxs || !ethTxs.length) {
                  log.info('erc20 get txlist empty, address ' + address + ', api index ' + (apiIndex-1));
                  return next();
                }

                for(var i=0; i<ethTxs.length; i++) {
                    (function (index) {
                        var ethTx = ethTxs[index];
                        ethTx.from = new ethCoin.Address(ethTx.from).toString();
                        ethTx.to = new ethCoin.Address(ethTx.to).toString();
                        //var bitTx = ethTxToBitTx(ethTx);
                        //result.push(bitTx);
                        storage.storeTRYTxHistory(ethTx, function (err) {
                            if (err) {
                                log.error('erc20 storeTRYTxHistory error ' + err);
                            }
                        });
                    })(i);
                }
                log.info('get txlist success, address ' + address);
                return next();
            }
        });
    }

    function updateHistory() {
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
          log.error('erc20 getTransactions finish, error ' + err);
          return;
        }
      });
    }
    setTimeout(updateHistory, 10*1000);

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
