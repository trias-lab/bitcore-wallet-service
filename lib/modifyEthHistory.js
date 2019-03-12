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

function BlockchainMonitorEth() {};

BlockchainMonitorEth.prototype.start = function(opts, cb) {
    opts = opts || {};

    var self = this;

    async.parallel([

        function(done) {
            self.explorers = {
                eth: {},
            };

            var coinNetworkPairs = [];
            _.each(['eth'], function(coin) {
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

BlockchainMonitorEth.prototype._initExplorer = function(coin, network, explorer) {
    var self = this;
};

BlockchainMonitorEth.prototype._startLoop = function () {
    var self = this;
    _.each(_.values(['eth']), function(coin) {
        _.each(_.values(['livenet']), function(network) {
            var explorer = self.explorers[coin][network]
            var initDelay = 1;
            setTimeout(function () {
                self._addToLoop(coin, network, explorer);
            }, initDelay);
        });
    });
}

BlockchainMonitorEth.prototype._addToLoop = function(coin, network, explorer) {
    var self = this;
    self._checkBlockHeight(coin, network, explorer);
}

BlockchainMonitorEth.prototype._checkBlockHeight = function(coin, network, explorer) {
    var self = this;
    self.storage.getAllETHTxHistory(function (err, txs) {
        if (err) {
            return;
        }

        async.eachSeries(txs, function (tx, next) {
            if (!tx.from || !tx.to) {
                log.error('tx not complete, tx hash', tx.hash);
                return next();
            }
            tx.from = new ethCoin.Address(tx.from).toString();
            tx.to = new ethCoin.Address(tx.to).toString();
            self.storage.updateETHTxFromTo(tx, function (err) {
                return next(err);
            });
        }, function (err) {
            if (err) {
                log.error('_checkBlockHeight finish, error ' + err);
                return;
            } else {
                log.error('_checkBlockHeight finish, ');
            }
        });
    });
}

module.exports = BlockchainMonitorEth;
