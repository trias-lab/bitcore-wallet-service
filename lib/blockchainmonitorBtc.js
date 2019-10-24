'use strict';

var $ = require('preconditions').singleton();
var _ = require('lodash');
var async = require('async');
var log = require('npmlog');
log.debug = log.verbose;

var BlockchainExplorer = require('./blockchainexplorer');
var Storage = require('./storage');
var MessageBroker = require('./messagebroker');
var Lock = require('./lock');

var Notification = require('./model/notification');

var WalletService = require('./server');
var Common = require('./common');
var Constants = Common.Constants;
var Utils = Common.Utils;
var https = require('https')

const TIMEOUT_MS = 1000*30

const PROCESS_STATE_SAVED     = 1
const PROCESS_STATE_PROCESSED = 2


function BlockchainMonitorBTC() {}

BlockchainMonitorBTC.prototype.start = function(opts, cb) {
  opts = opts || {};

  function startMainNet() {
    var mainnetScan = new BlockScan(false)
    mainnetScan.startScan(opts, function (err) {
      if (err) {
        return cb(err)
      }
      return cb(null);
    });
  }

  var testnetScan = new BlockScan(true)
  testnetScan.startScan(opts, function (err) {
    if (err) {
      return cb(err)
    }
    setTimeout(startMainNet, 1000*30)
  });
}

function BlockScan(isTestNet) {
  this.isTestnet = isTestNet
  if (this.isTestnet) {
    this.apiHost = 'testnet-api.smartbit.com.au'
    this.apiPrefix = '/v1/blockchain'
  } else {
    this.apiHost = 'api.smartbit.com.au'
    this.apiPrefix = '/v1/blockchain'
  }
}

BlockScan.prototype.logError = function() {
  var self = this
  var args = Array.prototype.slice.call(arguments)
  var isTestnet = this.isTestnet ? 'testnet' : 'mainnet'
  args.push(new Date(), isTestnet)
  log.error.apply(null, args)
}

//for log print
BlockScan.prototype.getURL = function(path) {
  var self = this
  return "https://" + this.apiHost + this.apiPrefix +  path
}

BlockScan.prototype.makeGetRequest = function(path, callback) {
  var self = this
  var opt = {
    method: "GET",
    host: this.apiHost,
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
          return callback('smartbit makeGetRequest parse json error ' + e + ',' + 'body length ' + body.length + ', body end part: ' + body.substring(body.length - 100 > 0 ? body.length -100 : 0));
        }
        if (!obj || !obj.success) {
          self.logError('smartbit makeGetRequest fail', body)
          return callback(body);
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


BlockScan.prototype.reqLatestBlockHeight = function(callback) {
  var self = this
  var path = '/totals'
  var reduce = 2
  self.makeGetRequest(path, function (err, obj) {
    if (err || !obj || !obj.success) {
      self.logError('smartbit reqLatestBlockHeight, err', err)
      return callback(err)
    }
    if(obj.totals && obj.totals.block_count) {
      return callback(null, obj.totals.block_count-reduce)
    } else {
      return callback(null, 'smartbit reqLatestBlockHeight null')
    }
  });
};

BlockScan.prototype.reqBlockByHeight = function(height, callback) {
  var self = this
  var limit = 50
  var path = '/block/' + height + '?limit=' + limit
  var all = {txs : []}
  log.info('smartbit begin reqBlockByHeight, url', self.getURL(path))
  async.whilst(
    function isContinue() {
      return path !== null;
    },
    function iter(next) {
      self.makeGetRequest(path, function (err, obj) {
        if (err || !obj || !obj.success) {
          self.logError('smartbit reqBlockByHeight, err', err, obj)
          path = null
          return next(err)
        }
        if (!obj.block || !obj.block.transactions || !obj.block.transactions.length) {
          self.logError('smartbit reqBlockByHeight transactions null, check url to make sure block empty', obj.block);
          path = null;
          return next(null)
        }
        all.hash = obj.block.hash
        all.height = obj.block.height
        if (!obj.block.transactions[0].inputs) {//coinbase
          obj.block.transactions.shift()
        }
        var txs = obj.block.transactions.map(function (tx) {
          var ret = {}
          ret.vin = tx.inputs.map(function (vin) {
            return {
              addr:vin.addresses[0],
              valueSat:Utils.parseBalance(vin.value_int),
              txid:vin.txid,
              vout:vin.vout,
            }
          })
          ret.vout = tx.outputs.map(function (vout) { //utxo
            return {
              txid:tx.txid,
              vout:vout.n,
              address:vout.addresses[0],
              scriptPubKey:vout.script_pub_key.hex,
              amount:vout.value,
              satoshis:Utils.parseBalance(vout.value_int),
              confirmations:10,
            }
          })
          ret.blocktime = tx.time
          ret.fees = tx.fee
          ret.txid = tx.txid
          ret.confirmations = tx.confirmations
          ret.blockheight = tx.block
          ret.size = tx.size
          return ret
        })
        if (obj.block.transaction_paging && obj.block.transaction_paging.next_link) {
          var index = obj.block.transaction_paging.next_link.indexOf(self.apiPrefix)
          if (index === -1) {
            self.logError('smartbit reqBlockByHeight, not find next link', obj.block.transaction_paging.next_link)
            path = null
          } else {
            path = obj.block.transaction_paging.next_link.substring(index + self.apiPrefix.length)
            log.info('smartbit reqBlockByHeight, get next path', path)
          }
        } else {
          self.logError('smartbit reqBlockByHeight, not find transaction_paging')
          path = null
        }
        all.txs = all.txs.concat(txs)
        log.info('smartbit reqBlockByHeight new transaction count', txs.length, all.txs.length)
        return next(null, txs)
      })
    },
    function (err, results) {
      if(err) {
        self.logError('reqBlockByHeight err', err)
        return callback(err)
      }
      log.info('smartbit reqBlockByHeight, height', height, 'transactions count', all.txs.length)
      return callback(null, all)
    }
  );
};


BlockScan.prototype._handleThirdPartyBroadcasts = function(txid, processIt) {
  var self = this;
  if (!txid) return;

  self.storage.fetchTxByHash(txid, function(err, txp) {
    if (err) {
      log.error('Could not fetch tx from the db');
      return;
    }
    if (!txp || txp.status != 'accepted') return;

    var walletId = txp.walletId;

    if (!processIt) {
      log.info('Detected broadcast ' + txid + ' of an accepted txp [' + txp.id + '] for wallet ' + walletId + ' [' + txp.amount + 'sat ]');
      return setTimeout(self._handleThirdPartyBroadcasts.bind(self, txid, true), 20 * 1000);
    }

    log.info('Processing accepted txp [' + txp.id + '] for wallet ' + walletId + ' [' + txp.amount + 'sat ]');

    txp.setBroadcasted();

    self.storage.softResetTxHistoryCache(walletId, function() {
      self.storage.storeTx(self.walletId, txp, function(err) {
        if (err)
          log.error('Could not save TX');

        var args = {
          txProposalId: txp.id,
          txid: txid,
          amount: txp.getTotalAmount(),
        };

        var notification = Notification.create({
          type: 'NewOutgoingTxByThirdParty',
          data: args,
          walletId: walletId,
        });
        self._storeAndBroadcastNotification(notification);
      });
    });
  });
};

BlockScan.prototype._handleIncomingPayments = function(coin, network, data) {
  var self = this;
  if (!data || !data.vout) return;

  var outs = _.compact(_.map(data.vout, function(v) {
    var addr = _.keys(v)[0];
    var amount = +v[addr];

    // This is because a bug on insight, that always return no copay addr
    if (coin == 'bch' && Utils.getAddressCoin(addr) !='bch') {
      addr = Utils.translateAddress(addr, coin);
    }

    return {
      address: addr,
      amount: amount,
    };
  }));
  if (_.isEmpty(outs)) return;

  async.each(outs, function(out, next) {

    // toDo, remove coin  here: no more same address for diff coins
    self.storage.fetchAddressByCoin(coin, out.address, function(err, address) {
      if (err) {
        log.error('Could not fetch addresses from the db');
        return next(err);
      }
      if (!address || address.isChange) return next();

      var walletId = address.walletId;
      log.info('Incoming tx for wallet ' + walletId + ' [' + out.amount + 'sat -> ' + out.address + ']');

      var fromTs = Date.now() - 24 * 3600 * 1000;
      self.storage.fetchNotifications(walletId, null, fromTs, function(err, notifications) {
        if (err) return next(err);
        var alreadyNotified = _.some(notifications, function(n) {
          return n.type == 'NewIncomingTx' && n.data && n.data.txid == data.txid;
        });
        if (alreadyNotified) {
          log.info('The incoming tx ' + data.txid + ' was already notified');
          return next();
        }

        var notification = Notification.create({
          type: 'NewIncomingTx',
          data: {
            txid: data.txid,
            address: out.address,
            amount: out.amount,
          },
          walletId: walletId,
        });
        self.storage.softResetTxHistoryCache(walletId, function() {
          self._updateAddressesWithBalance(address, function() {
            self._storeAndBroadcastNotification(notification, next);
          });
        });
      });
    });
  }, function(err) {
    return;
  });
};

BlockScan.prototype._updateAddressesWithBalance = function(address, cb) {

  var self = this;

  self.storage.fetchAddressesWithBalance(address.walletId, function(err, result) {
    if (err) {
      log.warn('Could not update wallet cache', err);
      return cb(err);
    }
    var addresses = _.map(result,'address');

    if (_.indexOf(addresses, address.address) >= 0) {
      return cb();
    }

    addresses.push(address.address);
    log.info('Activating address ' + address.address);
    self.storage.storeAddressesWithBalance(address.walletId, addresses, function(err) {
      if (err) {
        log.warn('Could not update wallet cache', err);
      }
      return cb(err);
    });
  });
};

BlockScan.prototype._handleIncomingTx = function(coin, network, data) {
  var txid = data.txid
  this._handleThirdPartyBroadcasts(txid);
  //this._handleIncomingPayments(coin, network, data);
};

BlockScan.prototype._notifyNewBlock = function(coin, network, hash) {
  var self = this;

  log.info('New ' + network + ' block: ' + hash);
  var notification = Notification.create({
    type: 'NewBlock',
    walletId: network, // use network name as wallet id for global notifications
    data: {
      hash: hash,
      coin: coin,
      network: network,
    },
  });

  self.storage.softResetAllTxHistoryCache(function() {
    self._storeAndBroadcastNotification(notification, function(err) {
      return;
    });
  });
};

BlockScan.prototype._handleTxConfirmations = function(coin, network, hash) {
  var self = this;

  function processTriggeredSubs(subs, cb) {
    async.each(subs, function(sub) {
      log.info('New tx confirmation ' + sub.txid);
      sub.isActive = false;
      self.storage.storeTxConfirmationSub(sub, function(err) {
        if (err) return cb(err);

        var notification = Notification.create({
          type: 'TxConfirmation',
          walletId: sub.walletId,
          creatorId: sub.copayerId,
          data: {
            txid: sub.txid,
            coin: coin,
            network: network,
            // TODO: amount
          },
        });
        self._storeAndBroadcastNotification(notification, cb);
      });
    });
  };

  var explorer = self.explorers[coin][network];
  if (!explorer) return;

  explorer.getTxidsInBlock(hash, function(err, txids) {
    if (err) {
      log.error('Could not fetch txids from block ' + hash, err);
      return;
    }

    self.storage.fetchActiveTxConfirmationSubs(null, function(err, subs) {
      if (err) return;
      if (_.isEmpty(subs)) return;
      var indexedSubs = _.keyBy(subs, 'txid');
      var triggered = [];
      _.each(txids, function(txid) {
        if (indexedSubs[txid]) triggered.push(indexedSubs[txid]);
      });
      processTriggeredSubs(triggered, function(err) {
        if (err) {
          log.error('Could not process tx confirmations', err);
        }
        return;
      });
    });
  });
};

BlockScan.prototype._handleNewBlock = function(coin, network, hash) {
  this._notifyNewBlock(coin, network, hash);
  //this._handleTxConfirmations(coin, network, hash);
};

BlockScan.prototype._storeAndBroadcastNotification = function(notification, cb) {
  var self = this;

  self.storage.storeNotification(notification.walletId, notification, function() {
    self.messageBroker.send(notification)
    if (cb) return cb();
  });
};


//not use allAddress
BlockScan.prototype.processUtxoRemove = function(txArray, allAddress, callback) {
  var self = this
  var allTxVin = []
  txArray = [].concat(txArray)
  txArray.forEach(function (tx) {
    if (!tx || !tx.vin || !tx.vin.length) {
      self.logError('processUtxoRemove tx vin empty', tx)
      return
    }
    tx.vin.forEach(function (vin) {
      allTxVin.push(vin)
    })
  })

  async.each(allTxVin,
    function(vin, next) {
      if (!vin || !vin.txid) {
        self.logError('processUtxoRemove vin txid empty', vin)
        return next(null)
      }
      self.storage.removeBTCUtxo(vin, self.isTestnet, function (err) {
        if (err) {
          self.logError('removeBTCUtxo err',err);
          return next(err)
        }
        return next(null)
      })
    },
    function(err){
     if(err) {
       self.logError('processUtxoRemove err', err)
       return callback(err)
     }
     return callback(null)
   }
  );
}

BlockScan.prototype.processUtxoInsert = function(txArray, allAddress, callback) {
  var self = this
  self.logError('processUtxoInsert txArray length', txArray.length, 'allAddress count', Object.keys(allAddress).length)
  var myVout = []
  txArray = [].concat(txArray)
  var txIndex = -1
  txArray.forEach(function (tx) {
    txIndex++
    if (!tx || !tx.vout || !tx.vout.length) {
      self.logError('processUtxoInsert tx vout empty', tx, 'txIndex', txIndex)
      return
    }
    tx.vout.forEach(function (vout) {
      if (!vout || !vout.address) {
        //self.logError('processUtxoInsert tx vout element empty', 'txIndex', txIndex, tx)
        return
      }
      if (allAddress[vout.address]) {
        myVout.push(vout)
      }
    })
  })

  self.logError('processUtxoInsert find my vout count', myVout.length)
  async.each(myVout,
    function(vout, next) {
      if (!vout || !vout.txid) {
        self.logError('processUtxoInsert tx vout txid empty', vout)
        return next(null)
      }
      self.storage.insertBTCUtxo(vout, self.isTestnet, function (err) {
        if (err) {
          self.logError('insertBTCUtxo err',err);
          return next(err)
        }
        return next(null)
      })
    },
    function(err){
      if(err) {
        self.logError('processUtxoInsert err', err)
        return callback(err)
      }
      return callback(null)
    }
  );
}

BlockScan.prototype.processTransactionHistory = function(txArray, allAddress, callback) {
  var self = this
  txArray = [].concat(txArray)
  var txIndex = -1;
  async.each(txArray,
    function(tx, next) {
      txIndex++;
      if (!tx || !tx.txid) {
        self.logError('processTransactionHistory tx txid empty', tx)
        return next(null)
      }
      var myAddress = {}
      tx.vin = [].concat(tx.vin)
      tx.vout = [].concat(tx.vout)
      tx.vin.forEach(function (vin) {
        if (allAddress[vin.addr]) {
          myAddress[vin.addr] = true
        }
      })
      tx.vout.forEach(function (vout) {
        if (allAddress[vout.address]) {
          myAddress[vout.address] = true
        }
      })
      if (Object.keys(myAddress).length) {
        self.logError('processTransactionHistory, find myAddress count', Object.keys(myAddress).length, 'txIndex', txIndex)
        var network = self.isTestnet ? 'testnet' : 'livenet'
        self._handleIncomingTx('btc', network, tx);
      }
      async.each(Object.keys(myAddress),
        function (addr, innerNext) {
          self.storage.storeBTCTxHistory(addr, tx, self.isTestnet, function (err) {
            if (err) {
              self.logError('storeBTCTxHistory err', err)
              return innerNext(err)
            }
            return innerNext(null)
          })
        },
        function (err) {
          if (err) {
            return next(err)
          }
          return next(null)
        })
    },
    function(err){
      if(err) {
        self.logError('processTransactionHistory err', err)
        return callback(err)
      }
      return callback(null)
    }
  );
}

BlockScan.prototype.processBlock = function() {
  var self = this;
  if (self.isProcessingBlock) {
    self.logError('BlockScan processBlock re enter')
    return;
  }
  self.isProcessingBlock = true;
  self.logError('begin processBlock')
  var txArray = []
  var allAddress = {}
  async.series([
      //load db block
      function(next){
        //self.logError('processBlock 1')
        self.storage.loadBTCLatestBlockCache(self.isTestnet, function (err, data) {
          if (err) {
            self.logError('loadBTCLatestBlockCache err', err)
            return next(err)
          }
          if (!data) { //no data in db
            return next('no data in db')
          }
          if (!data.processState || (data.processState !== PROCESS_STATE_PROCESSED && data.processState !== PROCESS_STATE_SAVED)) {
            self.logError('processBlock, db data not has right processState', data.processState)
            return next('db processState error')
          }
          if (data.processState !== PROCESS_STATE_SAVED) {
            self.logError('processBlock data is processing')
            return next('data is processing')
          }
          txArray = data.txArray
          var network = self.isTestnet ? 'testnet' : 'livenet'
          self._handleNewBlock('btc', network, data.blockHash )
          return next(null)
        });
      },
      // load all addresses
      function(next){
        //self.logError('processBlock 2')
        if (!txArray.length) {
          return next(null)
        }
        var network = self.isTestnet ? 'testnet' : 'livenet'
        self.storage.fetchAllAddress('btc', network, function (err, addressArray) {
          if (err) {
            self.logError('fetchAllAddress error', err)
            return next('fetchAllAddress error')
          }
          if (addressArray && addressArray.length) {
            addressArray.forEach(function (address) {
              allAddress[address.address] = true
            })
          }
          return next(null)
        })
      },
      //utxo remove
      function(next) {
        //self.logError('processBlock 3')
        if (!txArray.length || !Object.keys(allAddress).length) {
          return next(null)
        }
        self.processUtxoRemove(txArray, allAddress, function (err) {
          if (err) {
            self.logError('processUtxoRemove err', err)
            return next(err)
          }
          return next(null)
        })
      },
      //utxo insert
      function(next) {
        //self.logError('processBlock 4')
        if (!txArray.length || !Object.keys(allAddress).length) {
          return next(null)
        }
        self.processUtxoInsert(txArray, allAddress, function (err) {
          if (err) {
            self.logError('processUtxoInsert err', err)
            return next(err)
          }
          return next(null)
        })
      },
      //insert history
      function(next) {
        //self.logError('processBlock 5')
        if (!txArray.length || !Object.keys(allAddress).length) {
          return next(null)
        }
        self.processTransactionHistory(txArray, allAddress, function (err) {
          if (err) {
            self.logError('processTransactionHistory err', err)
            return next(err)
          }
          return next(null)
        })
      },
    ],
    function(err, results){
      //self.logError('processBlock 6')
      self.isProcessingBlock = false
      if (err) {
        self.logError(err)
      }
      self.storage.updateBTCLatestBlockCacheState(self.isTestnet, PROCESS_STATE_PROCESSED, function (err) {
        if (err) {
          self.logError('updateBTCLatestBlockCacheState err', err)
        }
        self.logError('end processBlock')
      })
    });
}


BlockScan.prototype.checkDBBlockState = function() {
  var self = this;

  self.storage.loadBTCLatestBlockCache(self.isTestnet, function (err, data) {
    if (err) {
      self.logError('checkDBBlockState loadBTCLatestBlockCache err', err)
      return;
    }
    if (!data) { //no data in db
      return;
    }
    if (!data.processState || (data.processState !== PROCESS_STATE_PROCESSED && data.processState !== PROCESS_STATE_SAVED)) {
      self.logError('checkDBBlockState, db data not has right processState', data.processState)
      return;
    }
    if (data.processState !== PROCESS_STATE_PROCESSED) {
      self.logError('checkDBBlockState data state wrong')
      self.processBlock();
    }
    return;
  });
}


BlockScan.prototype.scanBlock = function() {
  var self = this;
  var shortDelay = 1000 * 60
  var longDelay = 1000 * 60
  if (self.isTestnet) {
    shortDelay = 1000 * 60
    longDelay = 1000 * 60
  }
  function nextLoop(delay) {
    setTimeout(function () {
      self.scanBlock();
    }, delay || shortDelay);
  }

  var dbBlockHeight = 0
  var needReqNewBlock = false
  async.series([
      //load db
      function(next){
         self.storage.loadBTCLatestBlockCache(self.isTestnet, function (err, data) {
           if (err) {
             self.logError('loadBTCLatestBlockCache err', err)
             return next(err)
           }
           if (!data) { //no data in db
             self.logError('no latest block in db, load latest block from net')
             dbBlockHeight = 0
             needReqNewBlock = true
             return next(null)
           }
           if (!data.processState || (data.processState !== PROCESS_STATE_PROCESSED && data.processState !== PROCESS_STATE_SAVED)) {
             self.logError('scanBlock, db data not has right processState', data.processState)
             return next('db processState error')
           }
           if (data.processState === PROCESS_STATE_PROCESSED) {
             dbBlockHeight = data.blockHeight
             needReqNewBlock = true
             return next(null)
           }
           if (data.processState === PROCESS_STATE_SAVED) {
             self.logError('current block has not been processed, wait process finished')
             needReqNewBlock = false
             return next(null)
           }
         })
      },
      //req new block data
      function(next){
        if (!needReqNewBlock) {
          return next(null)
        }
        self.reqLatestBlockHeight(function (err, latestBlockHeight) {
          if (err || !latestBlockHeight) {
            return next('reqLatestBlockHeight err', latestBlockHeight)
          }
          var nextBlockHeight;
          if (!dbBlockHeight) {
            nextBlockHeight = latestBlockHeight;
          } else if (dbBlockHeight === latestBlockHeight) {
            self.logError('db height equal to latest height, wait next loop, db height', dbBlockHeight)
            return next(null)
          } else if (dbBlockHeight > latestBlockHeight) {
            self.logError('logic error, db height > latest height', dbBlockHeight, latestBlockHeight)
            return next('logic height error')
          } else {
            nextBlockHeight = dbBlockHeight + 1
          }
          self.reqBlockByHeight(nextBlockHeight, function (err, block) {
            if (err) {
              self.logError('reqBlockByHeight error', err)
              return next('reqBlockByHeight error')
            }
            if (!block.txs || !block.txs.length) {
              self.logError('reqBlockByHeight tx empty')
            }
            if (block.txs.length && block.height !== nextBlockHeight) {
              self.logError('txArray data error', block.height, nextBlockHeight)
              return next('txArray data error')
            }
            var data = {}
            data.txArray = block.txs;
            data.processState = PROCESS_STATE_SAVED;
            data.blockHeight = nextBlockHeight;
            data.blockHash = block.hash
            self.storage.storeBTCLatestBlockCache(self.isTestnet, data, function (err) {
              if (err) {
                self.logError('storeBTCLatestBlockCache error');
                return next('storeBTCLatestBlockCache error')
              }
              setTimeout(function () {
                self.processBlock();
              }, 0)
              return next(null);
            })
          })
        })
      }
    ],
    function(err, results){
      if (err) {
        self.logError('scanBlock err', err)
      }
      return nextLoop(shortDelay)
    });
}

BlockScan.prototype.startScan = function(opts, cb) {
  var self = this
  async.parallel([
    function(done) {
      if (opts.storage) {
        self.storage = opts.storage;
        done();
      } else {
        self.storage = new Storage();
        self.storage.connect(opts.storageOpts, done);
      }
    },
    function(done) {
      self.messageBroker = opts.messageBroker || new MessageBroker(opts.messageBrokerOpts);
      done();
    },
    function(done) {
      self.lock = opts.lock || new Lock(opts.lockOpts);
      done();
    },
  ], function(err) {
    if (err) {
      self.logError(err);
      return cb(err)
    }
    self.checkDBBlockState();
    self.scanBlock();
    return cb(null);
  });
}


module.exports = BlockchainMonitorBTC;
