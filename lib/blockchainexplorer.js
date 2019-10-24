'use strict';

var _ = require('lodash');
var $ = require('preconditions').singleton();
var log = require('npmlog');
log.debug = log.verbose;

//var Insight = require('./blockchainexplorers/insight');
var Insight = require('./blockchainexplorers/insight_smartbit');
//var EtherScan = require('./blockchainexplorers/etherScan');
var EtherScan = require('./blockchainexplorers/ethersscan_infura');
//var Erc20 = require('./blockchainexplorers/erc20');
var Erc20 = require('./blockchainexplorers/erc20_infura');
var Common = require('./common');
var Constants = Common.Constants,
  Defaults = Common.Defaults,
  Utils = Common.Utils;

var PROVIDERS = {
  'insight': {
    'btc': {
      'livenet': 'https://insight.bitpay.com:443',
      'testnet': 'https://test-insight.bitpay.com:443',
    },
    'bch': {
      'livenet': 'https://bch-insight.bitpay.com:443',
      'testnet': 'https://test-bch-insight.bitpay.com:443',
    },
  },
  'etherScan': {
      'eth': {
          'livenet': ' '
      },
  },
  'erc20': {
        'try': {
            'livenet': ' '
        },
  },
  /*
  'triRpc': {
        'tri': {
            'livenet': ' '
        },
  },
*/
};

function BlockChainExplorer(opts) {
  $.checkArgument(opts);

  var provider = opts.provider || 'insight';
  var coin = opts.coin || Defaults.COIN;
  var network = opts.network || 'livenet';

  $.checkState(PROVIDERS[provider], 'Provider ' + provider + ' not supported');
  $.checkState(_.includes(_.keys(PROVIDERS[provider]), coin), 'Coin ' + coin + ' not supported by this provider');
  $.checkState(_.includes(_.keys(PROVIDERS[provider][coin]), network), 'Network ' + network + ' not supported by this provider for coin ' + coin);

  var url = opts.url || PROVIDERS[provider][coin][network];


  if (coin != 'bch' && opts.addressFormat)
    throw new Error('addressFormat only supported for bch');

  if (coin == 'bch' && !opts.addressFormat)
    opts.addressFormat = 'cashaddr';
  

  switch (provider) {
    case 'insight':
      return new Insight({
        coin: coin,
        network: network,
        url: url,
        apiPrefix: opts.apiPrefix,
        userAgent: opts.userAgent,
        addressFormat: opts.addressFormat,
      });
    case 'etherScan':
      return new EtherScan({
          coin: coin,
          network: network,
          userAgent: opts.userAgent,
      });
    case 'erc20':
        return new Erc20({
              coin: coin,
              network: network,
              userAgent: opts.userAgent,
          });
    case 'triRpc':
        /*
      return new TriRpc({
          coin: coin,
          network: network,
          userAgent: opts.userAgent,
    });
    */
        throw new Error('Provider ' + provider + ' not supported.');
    default:
      throw new Error('Provider ' + provider + ' not supported.');
  };
};

module.exports = BlockChainExplorer;
