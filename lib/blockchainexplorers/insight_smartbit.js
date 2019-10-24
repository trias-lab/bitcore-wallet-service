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
var https = require('https')

const TIMEOUT_MS = 1000*30

function Insight(opts) {
  $.checkArgument(opts);
  $.checkArgument(Utils.checkValueInCollection(opts.network, Constants.NETWORKS));
  $.checkArgument(Utils.checkValueInCollection(opts.coin, Constants.COINS));
  $.checkArgument(opts.url);

  this.coin = opts.coin || Defaults.COIN;
  this.network = opts.network || 'livenet';
  if (this.network === 'livenet') {
    this.host = 'api.smartbit.com.au'
    this.isTestnet = false;
  } else {
    this.host = 'testnet-api.smartbit.com.au'
    this.isTestnet = true;
  }
  this.apiPrefix = '/v1/blockchain'
  this.userAgent = opts.userAgent || 'bws';
}

Insight.prototype.getConnectionInfo = function() {
  return 'btc (' + this.coin + '/' + this.network + ') @ ' + this.host;
};

Insight.prototype.makeGetRequest = function(path, callback) {
  var opt = {
    method: "GET",
    host: this.host,
    port: 443,
    path: this.apiPrefix + path,
    timeout: TIMEOUT_MS,
  };

  var newReq = https.request(opt, function(newRes){
    if(newRes.statusCode === 200){
      newRes.setEncoding('utf8');
      var body = "";
      newRes.on('data', function(recData){
        body += recData;
      });
      newRes.on('end', function(){
        //console.log('end body', body)
        var obj;
        try {
          obj = JSON.parse(body);
        } catch (e) {
          return callback('smartbit makeGetRequest parse json error ' + e + ',' + body);
        }
        if (!obj || !obj.success) {
          log.error('smartbit makeGetRequest fail', body)
          return callback(body)
        }
        if (obj.error && obj.error.message) {
          return callback(obj.error.message)
        }
        callback(null, obj);
      });
    } else {
      callback('smartbit makeGetRequest, status:' + newRes.statusCode)
    }
  });
  newReq.on('error', (e) => {
    callback('smartbit makeGetRequest: error ' + e)
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

Insight.prototype.makePostRequest = function(path, postData, callback) {
  var opt = {
    method: "POST",
    host: this.host,
    port: 443,
    path: this.apiPrefix + path,
    timeout: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var newReq = https.request(opt, function(newRes){
    if(newRes.statusCode === 200){
      newRes.setEncoding('utf8');
      var body = "";
      newRes.on('data', function(recData){
        body += recData;
      });
      newRes.on('end', function(){
        //console.log('end body', body)
        var obj;
        try {
          obj = JSON.parse(body);
        } catch (e) {
          return callback('smartbit makePostRequest parse json error ' + e + ',' + body);
        }
        if (obj.error && obj.error.message) {
          return callback(obj.error.message)
        }
        callback(null, obj);
      });
    } else {
      callback('smartbit makePostRequest, status:' + newRes.statusCode)
    }
  });
  newReq.on('error', (e) => {
    callback('smartbit makePostRequest: error ' + e)
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
  newReq.write(postData)
  newReq.end();
}

/**
 * Retrieve a list of unspent outputs associated with an address or set of addresses
 */
Insight.prototype.getUtxos = function(addresses, callback, walletId, storage) {
  var self = this;

  storage.getBTCUtxoWithAddressArray(addresses, self.isTestnet, function (err, utxoArray) {
    if (err) {
      log.error('insight getUtxos getBTCUtxoWithAddressArray error ' + err);
      return callback(err, []);
    } else {
      log.info('insight getUtxos result count ' + utxoArray.length);
      return callback(null, utxoArray);
    }
  });
};

/**
 * Broadcast a transaction to the bitcoin network
 */
Insight.prototype.broadcast = function(rawTx, callback) {
  var self = this
  var tx = {hex:rawTx}
  self.makePostRequest('/pushtx', JSON.stringify(tx), function (err, result) {
    if (err) {
      return callback(err)
    }
    var txid = result.txid
    return callback(null, txid)
  })
};

Insight.prototype.getTransaction = function(txid, callback) {
  var self = this
  var path = '/tx/' + txid
  self.makeGetRequest(path, function (err, result) {
    if (err) {
      return callback(err)
    }
    if (!result.success) {
      return callback('smartbit tx parse error')
    }

    return callback(null, result.transaction)
  })
};

Insight.prototype.getTransactions = function(addresses, from, to, callback, walletId, storage) {
  var self = this;

  storage.batchGetBTCTxHistory(addresses, self.isTestnet, function (err, txs) {
    if (err) {
      return callback(err)
    }
    if (txs && txs.length) {
      txs.forEach(function (tx) {
        if (tx.vout && tx.vout.length) {
          tx.vout.forEach(function (vout) {
            vout.value = vout.amount
            vout.scriptPubKey = {addresses:[vout.address]}
          })
        }
      })
    }
    return callback(null, txs, txs ? txs.length : 0)
  })
};

Insight.prototype.getAddressActivity = function(address, callback) {
  var self = this
  var limit = 1
  var path = '/address/' + address + '/limit=' + limit
  self.makeGetRequest(path, function (err, obj) {
    if (err || !obj || !obj.success) {
      log.error('smartbit getAddress activity, err', err)
      return callback(err)
    }
    if(obj.transactions && obj.transactions.length) {
      return callback(null, true)
    } else {
      return callback(null, false)
    }
  });
};

Insight.prototype.estimateFee = function(nbBlocks, callback) {
  var path = '/api/utils/estimatefee';
  if (nbBlocks) {
    path += '?nbBlocks=' + [].concat(nbBlocks).join(',');
  }
  Utils.makeHttpsGetRequest('insight.bitpay.com', path, 1000*10, function (err, body) {
    if (err) {
      log.error('estimateFee error, url', 'https://insight.bitpay.com' + path)
      return callback(err)
    }
    return callback(null, body)
  })
};

Insight.prototype.getBlockchainHeight = function(callback) {
  var self = this
  var path = '/totals'
  self.makeGetRequest(path, function (err, obj) {
    if (err || !obj || !obj.success) {
      log.error('smartbit getBlockchainHeight, err', err)
      return callback(err)
    }
    if(obj.totals && obj.totals.block_count) {
      return callback(null, obj.totals.block_count-1)
    } else {
      return callback(null, 0)
    }
  });
};

Insight.prototype.getTxidsInBlock = function(blockHash, callback) {
  var self = this
  var limit = 50
  var path = '/block/' + blockHash + '?limit=' + limit
  var all = []
  async.whilst(
    function isContinue() {
      return path !== null;
    },
    function iter(next) {
      self.makeGetRequest(path, function (err, obj) {
        if (err || !obj || !obj.success) {
          self.logError('smartbit getTxidsInBlock, err', err, obj)
          path = null
          return next(err)
        }
        var txids = obj.block.transactions.map(function (tx) {
          return tx.txid
        })
        all = all.concat(txids)
        log.info('smartbit getTxidsInBlock new transaction count', txids.length, all.length)
        return next(null, txids)
      })
    },
    function (err, results) {
      if(err) {
        self.logError('getTxidsInBlock err', err)
        return callback(err)
      }
      log.info('smartbit getTxidsInBlock, blockHash', blockHash, 'transactions count', all.length)
      return callback(null, all)
    }
  );
};


module.exports = Insight;
