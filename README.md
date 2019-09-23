
# BWS

[![Latest Tag](https://img.shields.io/badge/tag-v2.6.0-orange.svg)](https://github.com/trias-lab/bitcore-wallet-service/tree/v2.6.0)
[![NPM Package](https://img.shields.io/npm/v/bitcore-wallet-service.svg?style=flat-square)](https://www.npmjs.org/package/bitcore-wallet-service)
[![Build Status](https://img.shields.io/travis/bitpay/bitcore-wallet-service.svg?branch=master&style=flat-square)](https://travis-ci.org/bitpay/bitcore-wallet-service)
[![Coverage Status](https://coveralls.io/repos/bitpay/bitcore-wallet-service/badge.svg?branch=master)](https://coveralls.io/r/bitpay/bitcore-wallet-service?branch=master)
[![Node version](https://img.shields.io/badge/node-v8.15.0-blue.svg)](https://nodejs.org)
[![Lincese](https://img.shields.io/badge/Lincese-GPL3.0-green.svg)](http://www.gnu.org/licenses/gpl-3.0.html) 

<br/>
A  HD Wallet Backend Service. Support Btc, Bch, Eth, TRY testnet(including both normal and private transactions). 
<br/>

Branch    | Tests | Coverage
----------|-------|----------
master    | ![CircleCI](https://img.shields.io/badge/circleci-passing-success.svg) | ![CircleCI](https://img.shields.io/badge/codecov-65%25-red.svg)
add-eth    | ![CircleCI](https://img.shields.io/badge/circleci-passing-success.svg) | ![CircleCI](https://img.shields.io/badge/codecov-67%25-red.svg)

# Description

BWS facilitates  HD wallets creation and operation through a (hopefully) simple and intuitive REST API.

BWS can usually be installed within minutes and accommodates all the needed infrastructure for peers in a wallet to communicate and operate – with minimum server trust.

See [BWC](https://github.com/trias-lab/bitcore-wallet-client) for the *official* client library that communicates to BWS and verifies its response.

# Requirements

| Requirement | Notes           |
| ----------- | --------------- |
| Node          | v8.15.0 or highter |
| mongodb      | v3.0.15 or highter            |

# Install 
```
 git clone https://github.com/trias-lab/bitcore-wallet-service.git
 cd bitcore-wallet-service
 npm install
 npm start
```


This will launch the BWS service (with default settings) at `http://localhost:3232/bws/api`.

BWS needs mongoDB. You can configure the connection at `config.js`

BWS supports SSL and Clustering. For a detailed guide on installing BWS with extra features see [Installing BWS](https://github.com/trias-lab/bitcore-wallet-service/blob/master/installation.md). 

BWS uses by default a Request Rate Limitation to CreateWallet endpoint. If you need to modify it, check defaults.js' `Defaults.RateLimit`

# Quick Start

Here is some normal configuration keys that must be changed before start the project.
Configuration file is  config.js.

| Key | Content           |
| ----------- | --------------- |
| storageOpts.mongoDb.uri          | mongodb server url, if default install, can be left unchanged |
| eth.EtherScanApiKey      | api key of etherscan, please visit https://etherscan.io/apis to apply            |
| try.url      | try v1 public node rpc url           |

# Documentation

Architecture design document is located at [bws architecture](https://github.com/trias-lab/bitcore-wallet-service/blob/master/doc/architecture.md)

Http api document is located at [bws api](https://dasenlincode.github.io/bws_api_doc)

Complete trias documentation can be found on the [website](https://github.com/trias-lab/Documentation).



## A Note on Production Readiness

While Trias is being used in production in private, permissioned
environments, we are still working actively to harden and audit it in preparation
for use in public blockchains.
We are also still making breaking changes to the protocol and the APIs.
Thus, we tag the releases as *alpha software*.

In any case, if you intend to run Trias in production,
please [contact us](mailto:contact@trias.one) and [join the chat](https://www.trias.one).

## Security

To report a security vulnerability,  [bug report](mailto:contact@trias.one)




## Contributing
All code contributions and document maintenance are temporarily responsible for TriasLab

Trias are now developing at a high speed and we are looking forward to working with quality partners who are interested in Trias. If you want to join.Please contact us:
- [Telegram](https://t.me/triaslab)
- [Medium](https://medium.com/@Triaslab)
- [BiYong](https://0.plus/#/triaslab)
- [Twitter](https://twitter.com/triaslab)
- [Gitbub](https://github.com/trias-lab/Documentation)
- [Reddit](https://www.reddit.com/r/Trias_Lab)
- [More](https://www.trias.one/)
- [Email](mailto:contact@trias.one)


### Upgrades

Trias is responsible for the code and documentation upgrades for all Trias modules.
In an effort to avoid accumulating technical debt prior to Beta,
we do not guarantee that data breaking changes (ie. bumps in the MINOR version)
will work with existing Trias blockchains. In these cases you will
have to start a new blockchain, or write something custom to get the old data into the new chain.

## Resources
### Research

* [The latest paper](https://www.contact@trias.one/attachment/Trias-whitepaper%20attachments.zip)
* [Project process](https://trias.one/updates/project)
* [Original Whitepaper](https://trias.one/whitepaper)
* [News room](https://trias.one/updates/recent)

