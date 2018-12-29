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

const BLOCKHEIGHT_POLL_MILLISECONDS = 500

function BlockchainMonitorTri() {};

BlockchainMonitorTri.prototype.start = function(opts, cb) {
  opts = opts || {};

  var self = this;

  async.parallel([

    function(done) {
      self.explorers = {
        tri: {},
      };

      var coinNetworkPairs = [];
      _.each(['tri'], function(coin) {
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

BlockchainMonitorTri.prototype._initExplorer = function(coin, network, explorer) {
  var self = this;
};

BlockchainMonitorTri.prototype._startLoop = function () {
    var self = this;
    _.each(_.values(['tri']), function(coin) {
        _.each(_.values(['livenet']), function(network) {
            var explorer = self.explorers[coin][network]
            var initDelay = 1;
            setTimeout(function () {
                self._addToLoop(coin, network, explorer);
            }, initDelay);
        });
    });
}

BlockchainMonitorTri.prototype._addToLoop = function(coin, network, explorer) {
    var self = this;
    self._checkBlockHeight(coin, network, explorer);
    setTimeout(function () {
      self._addToLoop(coin, network, explorer);
    }, BLOCKHEIGHT_POLL_MILLISECONDS);
}

BlockchainMonitorTri.prototype._saveTxHistory = function(tx) {

}

BlockchainMonitorTri.prototype._checkBlockHeight = function(coin, network, explorer) {
  var self = this;
  self.storage.getTriCheckHeight(network, function (err, lastHeight) {
      if (err) {
          log.error('Could not fetch tri check height from the db');
          return;
      }
      explorer.getBlockchainHeight(function (err, curHeight) {
          if (err) {
              log.error('getBlockchainHeight error');
              return;
          }
          if (curHeight <= lastHeight) {
            //log.info(network + ', cur height ' + curHeight + ', equal to last height ' + lastHeight);
            return;
          }
          self.storage.storeTriCheckHeight(network, curHeight, function (err, result) {
              if (err) {
                  log.error("storetTriCheckHeight, err " + err);
                  return;
              }
              explorer.getBlockTransactionCount(curHeight, function (err, transactionCount) {
                  if (err) {
                      log.error("getBlockTransactionCount, err " + err);
                      return;
                  }
                  if (transactionCount === 0) {
                      if (curHeight % 100 === 0) {
                          log.info('get tri empty block ' + curHeight);
                      }
                      return;
                  }
                  explorer.getBlockchainData(curHeight, function (err, blockData) {
                      if (err) {
                          log.error('getBlockchainData error');
                          return;
                      }
                      self._notifyNewBlock(coin, network, blockData.hash);
                      var txids = []
                      var transaction
                      for (var i = 0; i < blockData.transactions.length; i++) {
                          transaction = blockData.transactions[i];
                          txids.push(transaction.hash)
                      }
                      self._handleTxConfirmations(coin, network, txids);

                      for (var i = 0; i < blockData.transactions.length; i++) {
                          transaction = blockData.transactions[i];
                          self._handleThirdPartyBroadcasts(transaction);
                          self._handleIncomingPayments(coin, network, transaction);
                          self.storage.storeTriTxHistory(transaction, function (error) {
                            if (err) {
                                log.error('storeTriTxHistory err ' + error);
                            }
                          });
                      }
                  });
              });
          });

      });
  });
}

BlockchainMonitorTri.prototype._handleThirdPartyBroadcasts = function(transaction, processIt) {
  var self = this;
  if (!transaction || !transaction.hash) return;

  self.storage.fetchTxByHash(transaction.hash, function(err, txp) {
    if (err) {
      log.error('Could not fetch tx from the db, hash ' + transaction.hash);
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
          log.error('Could not save TX');

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

BlockchainMonitorTri.prototype._handleIncomingPayments = function(coin, network, transaction) {
  var self = this;
  if (!transaction || !transaction.to) return;

    // toDo, remove coin  here: no more same address for diff coins
  self.storage.fetchAddressByCoin(coin, transaction.to, function(err, address) {
      if (err) {
        log.error('Could not fetch addresses from the db');
        return;
      }
      if (!address) return;
      if (address.isChange) {
        log.error('address should not change, ' + transaction.to);
        return;
      }

      var walletId = address.walletId;
      var amount = parseInt(transaction.value, 16)
      log.info('Incoming tx for wallet ' + walletId + ' [' + amount + 'wei -> ' + transaction.to + ']');

      var fromTs = Date.now() - 24 * 3600 * 1000;
      self.storage.fetchNotifications(walletId, null, fromTs, function(err, notifications) {
        if (err) {
          log.error("fetchNotifications error " + err);
          return;
        }
        var alreadyNotified = _.any(notifications, function(n) {
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

BlockchainMonitorTri.prototype._updateAddressesWithBalance = function(address, cb) {

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


BlockchainMonitorTri.prototype._notifyNewBlock = function(coin, network, hash) {
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

BlockchainMonitorTri.prototype._handleTxConfirmations = function(coin, network, txids) {
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
          log.error('Could not process tx confirmations', err);
        }
        return;
      });
  });
};

BlockchainMonitorTri.prototype._storeAndBroadcastNotification = function(notification, cb) {
  var self = this;

  self.storage.storeNotification(notification.walletId, notification, function() {
    self.messageBroker.send(notification)
    if (cb) return cb();
  });
};

module.exports = BlockchainMonitorTri;
