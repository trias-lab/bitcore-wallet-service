'use strict';

function TriTx() {}

TriTx.create = function(opts) {
    opts = opts || {};

    var x = new TriTx();

    x.version = 1;
    var now = Date.now();
    x.createdOn = Math.floor(now / 1000);
    x.blockHash = opts.blockHash;
    x.blockNumber = opts.blockNumber;
    x.from = opts.from;
    x.gas = opts.gas;
    x.gasPrice = opts.gasPrice;
    x.hash = opts.hash;
    x.input = opts.input;
    x.nonce = opts.nonce;
    x.to = opts.to;
    x.transactionIndex = opts.transactionIndex;
    x.value = opts.value;
    x.v = opts.v;
    x.r = opts.r;
    x.s = opts.s;
    return x;
};

TriTx.fromObj = function(obj) {
    var x = new TriTx();

    x.createdOn = obj.createdOn;
    x.blockHash = obj.blockHash;
    x.blockNumber = obj.blockNumber;
    x.from = obj.from;
    x.gas = obj.gas;
    x.gasPrice = obj.gasPrice;
    x.hash = obj.hash;
    x.input = obj.input;
    x.nonce = obj.nonce;
    x.to = obj.to;
    x.transactionIndex = obj.transactionIndex;
    x.value = obj.value;
    x.v = obj.v;
    x.r = obj.r;
    x.s = obj.s;
    return x;
};


module.exports = TriTx;
