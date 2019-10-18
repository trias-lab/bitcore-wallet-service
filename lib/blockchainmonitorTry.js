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
var ethCoin = require('bitcore-lib-eth');
var Defaults = Common.Defaults

function logError() {
  var args = Array.prototype.slice.call(arguments)
  args.push(new Date())
  log.error.apply(null, args)
}

function BlockchainMonitorTry() {};

BlockchainMonitorTry.prototype.start = function(opts, cb) {
  opts = opts || {};

  var self = this;

  async.parallel([

    function(done) {
      self.explorers = {
        try: {},
      };

      var coinNetworkPairs = [];
      _.each(['try'], function(coin) {
        _.each(['livenet'], function(network) {
          coinNetworkPairs.push({
            coin: coin,
            network: network
          });
        });
      });
      _.each(coinNetworkPairs, function(pair) {
        var explorer;
        if (opts.blockchainExplorers && opts.blockchainExplorers[pair.coin] && opts.blockchainExplorers[pair.coin][pair.network]) {
          explorer = opts.blockchainExplorers[pair.coin][pair.network];
        } else {
          var config = {}
          if (opts.blockchainExplorerOpts && opts.blockchainExplorerOpts[pair.coin] && opts.blockchainExplorerOpts[pair.coin][pair.network]) {
            config = opts.blockchainExplorerOpts[pair.coin][pair.network];
          } else {
            return;
          }
          explorer = new BlockchainExplorer({
            provider: config.provider,
            coin: pair.coin,
            network: pair.network,
            url: config.url,
            userAgent: WalletService.getServiceVersion(),
          });
          log.info('init explorer, provider:' + config.provider);
        }
        $.checkState(explorer);
        self._initExplorer(pair.coin, pair.network, explorer);
        self.explorers[pair.coin][pair.network] = explorer;
      });
      done();
    },
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
      log.error(err);
    }
    self._startLoop();
    return cb(err);
  });
};

BlockchainMonitorTry.prototype._initExplorer = function(coin, network, explorer) {
  var self = this;
};

BlockchainMonitorTry.prototype._startLoop = function () {
  var self = this;
  _.each(_.values(['try']), function(coin) {
    _.each(_.values(['livenet']), function(network) {
      var explorer = self.explorers[coin][network]
      //tmp
      /*
      self.storage.storeTryCheckHeight(network, 0, function (err, result) {
        if (err) {
          log.error('tmp clean try check height, err ' + err);
          return;
        }
        log.info('tmp clean try check height')


        var initDelay = 1;
        setTimeout(function () {
          self._addToLoop(coin, network, explorer);
        }, initDelay);

      });
      */
      var initDelay = 1;
      setTimeout(function () {
        self._addToLoop(coin, network, explorer);
      }, initDelay);
    });
  });
}

BlockchainMonitorTry.prototype._addToLoop = function(coin, network, explorer) {
  var self = this;
  self._checkBlockHeight(coin, network, explorer);
}

BlockchainMonitorTry.prototype._checkBlockHeight = function(coin, network, explorer) {
  var self = this;
  var shortDelay = 1000 * 5
  var longDelay = 1000 * 10
  if (Defaults.IS_ETH_TEST) {
    shortDelay = 1000 * 1
    longDelay = 1000 * 5
  }
  var nextLoopDelay
  function nextLoop() {
    setTimeout(function () {
      self._checkBlockHeight(coin, network, explorer);
    }, nextLoopDelay);
  }

  self.storage.getTryCheckHeight(network, function (err, lastHeight) {
    if (err) {
      logError('Could not fetch try check height from the db');
      nextLoop();
      return;
    }
    explorer.getBlockchainHeight(function (err, curHeight) {
      if (err || !curHeight) {
        nextLoopDelay = longDelay
        logError('getBlockchainHeight error ' + curHeight + ',' + err + ', nextLoopDelay seconds:' + parseInt(nextLoopDelay/1000));
        nextLoop();
        return;
      }
      nextLoopDelay = shortDelay
      if (curHeight < lastHeight) {
        logError("logic error, cur height should bigger than last height", curHeight, lastHeight);
        nextLoop();
        return;
      }
      if (curHeight === lastHeight) {
        //log.info(network + ', cur height ' + curHeight + ', equal to last height ' + lastHeight);
        nextLoop();
        return;
      }

      if (!lastHeight) {
        log.info("not get db height, use ", curHeight - 1)
        lastHeight = curHeight - 1;
      }
      explorer.getEventsAndHeaderInBlock(lastHeight+1, function (err, events, blockHeader) {
        if (err) {
          nextLoopDelay = longDelay
          logError('getBlockchainData error, lastHeight+1:' + (lastHeight+1) + ', curHeight:' + curHeight + 'error:' + err);
          nextLoop();
          return;
        }
        if ((events && events.length) && (!blockHeader || !blockHeader.timestamp)) { //if no event, no block header
          nextLoopDelay = shortDelay
          logError('getBlockchainData, not get blockHeader, lastHeight+1:' + (lastHeight+1) + ', curHeight:' + curHeight + 'error:' + err, 'blockHeader', blockHeader);
          nextLoop();
          return;
        }
        nextLoopDelay = shortDelay
        self.storage.storeTryCheckHeight(network, lastHeight+1, function (err, result) {
          if (err) {
            logError('storeTryCheckHeight, err ' + err);
            nextLoop();
            return;
          }

          if (!events || !events.length) {
            var time = new Date().toLocaleString();
            log.info('no events, block height:' + (lastHeight+1) + ', ' + time)
            nextLoop();
            return;
          }

          var time = new Date().toLocaleString();
          log.info('handle new block events, height:' + (lastHeight+1) + ', ' + time)
          //self._notifyNewBlock(coin, network, blockData.hash);

          //self._handleTxConfirmations(coin, network, txids);
          var blockTime = parseInt(blockHeader.timestamp)

          for (var i = 0; i < events.length; i++) {
            (function (index) {
              var event = events[index];
              //log.info('from:', transaction.from, ', to:', transaction.to);
              if (!event.returnValues.to || !event.returnValues.from) {
                return;
              }
              var transaction = {}
              transaction.from = new ethCoin.Address(event.returnValues.from).toString();
              transaction.to = new ethCoin.Address(event.returnValues.to).toString();
              transaction.timeStamp = blockTime;
              transaction.hash = event.transactionHash;
              transaction.value = parseInt(event.returnValues.value)
              transaction.logIndex = event.logIndex
              //var fromAddress = new ethCoin.Address(transaction.from).toString();
              //var toAddress = new ethCoin.Address(transaction.to).toString();
              self._handleThirdPartyBroadcasts(transaction);
              //self._handleIncomingPayments(coin, network, transaction);

              var checkAddressArray = [transaction.from, transaction.to];

              self.storage.findAddresses('try', checkAddressArray, function (err, result) {
                if (err) {
                  logError('findAddresses try err ' + [transaction.from, transaction.to]);
                } else {
                  if (result && result.length) {
                    log.info('find my transaction ' + typeof result + ', length ' + result.length + ', transaction:', transaction.from, transaction.to, transaction);
                    self.storage.storeTRYTxHistory(transaction, function (error) {
                      if (error) {
                        logError('monitor storeTRYTxHistory err ' + error);
                      }
                    });

                    for(let j=0; j<result.length; j++) {
                      (function (index) {
                        var addr = result[index].address
                        //update balance
                        explorer.getAddressBalance(addr, function (err, amount) {
                          if (err) {
                            logError('getAddressBalance err', err)
                          } else {
                            self.storage.updateTRYBalanceCacheSingle(addr, amount, function (err, result) {
                              if (err) {
                                log.info('updateTRYBalanceCacheSingle err', err);
                                return;
                              }
                              log.info('update address balance, addr', addr, 'amount', amount)
                              self._handleIncomingPaymentsWithAddress(coin, network, addr, transaction.value, transaction.txid);
                            });
                          }
                        })
                      })(j)
                    }
                  }
                }
              });
            })(i);
          }
          nextLoop();
        });
      });
    });
  });
}

BlockchainMonitorTry.prototype._handleThirdPartyBroadcasts = function(transaction, processIt) {
  var self = this;
  if (!transaction || !transaction.hash) return;

  self.storage.fetchTxByHash(transaction.hash, function(err, txp) {
    if (err) {
      logError('Could not fetch tx from the db, hash ' + transaction.hash);
      return;
    }
    if (!txp || txp.status != 'accepted') return;

    var walletId = txp.walletId;

    if (!processIt) {
      log.info('Detected broadcast ' + transaction.hash + ' of an accepted txp [' + txp.id + '] for wallet ' + walletId + ' [' + txp.amount + 'wei ]');
      return setTimeout(self._handleThirdPartyBroadcasts.bind(self, transaction, true), 20 * 1000);
    }

    log.info('Processing accepted txp [' + txp.id + '] for wallet ' + walletId + ' [' + txp.amount + 'wei ]');

    txp.setBroadcasted();

    self.storage.softResetTxHistoryCache(walletId, function() {
      self.storage.storeTx(self.walletId, txp, function(err) {
        if (err)
          logError('Could not save TX');

        var args = {
          txProposalId: txp.id,
          txid: transaction.hash,
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

BlockchainMonitorTry.prototype._handleIncomingPayments = function(coin, network, transaction) {
  var self = this;
  if (!transaction || !transaction.to) {
    logError('_handleIncomingPayments transaction null');
    return;
  }

  // toDo, remove coin  here: no more same address for diff coins
  self.storage.fetchAddressByCoin(coin, transaction.to, function(err, address) {
    if (err) {
      logError('Could not fetch addresses from the db');
      return;
    }
    if (!address) {
      logError('_handleIncomingPayments address null')
      return;
    }
    if (address.isChange) {
      logError('address should not change, ' + transaction.to);
      return;
    }

    var walletId = address.walletId;
    var amount = parseInt(transaction.value)
    log.info('Incoming tx for wallet ' + walletId + ' [' + amount + ' wei -> ' + transaction.to + ']');

    var fromTs = Date.now() - 24 * 3600 * 1000;
    self.storage.fetchNotifications(walletId, null, fromTs, function(err, notifications) {
      if (err) {
        logError("fetchNotifications error " + err);
        return;
      }
      var alreadyNotified = _.some(notifications, function(n) {
        return n.type == 'NewIncomingTx' && n.data && n.data.txid == transaction.hash;
      });
      if (alreadyNotified) {
        log.info('The incoming tx ' + transaction.hash + ' was already notified');
        return;
      }

      var notification = Notification.create({
        type: 'NewIncomingTx',
        data: {
          txid: transaction.hash,
          address: transaction.to,
          amount: amount,
        },
        walletId: walletId,
      });
      self.storage.softResetTxHistoryCache(walletId, function() {
        self._updateAddressesWithBalance(address, function() {
          self._storeAndBroadcastNotification(notification);
        });
      });
    });
  });
};

BlockchainMonitorTry.prototype._handleIncomingPaymentsWithAddress = function(coin, network, addr, value, hash) {
  var self = this;
  if (!addr || !value) {
    logError('_handleIncomingPayments para null', addr, value);
    return;
  }

  // toDo, remove coin  here: no more same address for diff coins
  self.storage.fetchAddressByCoin(coin, addr, function(err, address) {
    if (err) {
      logError('Could not fetch addresses from the db');
      return;
    }
    if (!address) {
      logError('_handleIncomingPayments address null')
      return;
    }
    if (address.isChange) {
      logError('address should not change, ' + address);
      return;
    }

    var walletId = address.walletId;
    var amount = value
    log.info('Incoming tx for wallet ' + walletId + ' [' + amount + ' wei' + address + ']');

    var fromTs = Date.now() - 24 * 3600 * 1000;
    self.storage.fetchNotifications(walletId, null, fromTs, function(err, notifications) {
      if (err) {
        logError("fetchNotifications error " + err);
        return;
      }
      var alreadyNotified = _.some(notifications, function(n) {
        return n.type == 'NewIncomingTx' && n.data && n.data.txid == hash;
      });
      if (alreadyNotified) {
        log.info('The incoming tx ' + hash + ' was already notified');
        return;
      }

      var notification = Notification.create({
        type: 'NewIncomingTx',
        data: {
          txid: hash,
          address: addr,
          amount: amount,
        },
        walletId: walletId,
      });
      self.storage.softResetTxHistoryCache(walletId, function() {
        self._updateAddressesWithBalance(address, function() {
          self._storeAndBroadcastNotification(notification);
        });
      });
    });
  });
};

BlockchainMonitorTry.prototype._updateAddressesWithBalance = function(address, cb) {

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


BlockchainMonitorTry.prototype._notifyNewBlock = function(coin, network, hash) {
  var self = this;

  //log.info('New ' + network + ' block: ' + hash);
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

BlockchainMonitorTry.prototype._handleTxConfirmations = function(coin, network, txids) {
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

  self.storage.fetchActiveTxConfirmationSubs(null, function(err, subs) {
    if (err) return;
    if (_.isEmpty(subs)) return;
    var indexedSubs = _.keyBy(subs, 'txid');
    var triggered = [];
    _.each(txids, function(txid) {
      if (indexedSubs[txid])
        triggered.push(indexedSubs[txid]);
    });
    processTriggeredSubs(triggered, function(err) {
      if (err) {
        logError('Could not process tx confirmations', err);
      }
      return;
    });
  });
};

BlockchainMonitorTry.prototype._storeAndBroadcastNotification = function(notification, cb) {
  var self = this;

  self.storage.storeNotification(notification.walletId, notification, function() {
    self.messageBroker.send(notification)
    if (cb) return cb();
  });
};

module.exports = BlockchainMonitorTry;
