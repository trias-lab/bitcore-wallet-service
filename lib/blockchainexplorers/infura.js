
var https = require("https");

const TIMEOUT_MS = 5000


function Infura(opts) {


}

Infura.prototype.makePostRequest = function(postData, callback) {
  var opt = {
    method: "POST",
    host: "ropsten.infura.io",
    port: 443,
    path: '/v3/3f639396f94943fda9f3e013b6d0a793',
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
        console.log('end body', body)
        var obj;
        try {
          obj = JSON.parse(body);
        } catch (e) {
          return callback('infura makePostRequest parse json error ' + e + ',' + body);
        }
        if (obj.error && obj.error.message) {
          return callback(obj.error.message)
        }
        callback(null, obj.result);
      });
    } else {
      callback('infura makePostRequest, status:' + newRes.statusCode)
    }
  });
  newReq.on('error', (e) => {
    callback('infura makePostRequest: error ' + e)
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

Infura.prototype.getTransactionCount = function(address, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_getTransactionCount"
  req["params"] = [address,  "latest"]
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, count) {
    if (error) {
      return callback(error)
    }
    count = parseInt(count, 16)
    return callback(null, count)
  })
}

Infura.prototype.sendRawTransaction = function(raw, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_sendRawTransaction"
  req["params"] = [raw]
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, hash) {
    return callback(error, hash)
  })
}

Infura.prototype.getTransactionByHash = function(hash, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_getTransactionByHash"
  req["params"] = [hash]
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, transaction) {
    return callback(error, transaction)
  })
}

Infura.prototype.getBalance = function(address, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_getBalance"
  req["params"] = [address,  "latest"]
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, count) {
    if (error) {
      return callback(error)
    }
    count = parseInt(count, 16)
    return callback(null, count)
  })
}

Infura.prototype.blockNumber = function(callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_blockNumber"
  req["params"] = []
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, number) {
    if (error) {
      return callback(error)
    }
    number = parseInt(number, 16)
    return callback(null, number)
  })
}

Infura.prototype.getBlockByHash = function(hash, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_getBlockByHash"
  req["params"] = [hash,  true]
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, block) {
    return callback(error, block)
  })
}

Infura.prototype.getBlockByNumber = function(height, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_getBlockByNumber"
  req["params"] = [height,  true]
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, block) {
    return callback(error, block)
  })
}

Infura.prototype.getERC20Balance = function(contractAddress, queryAddress, callback) {
  var req = {};
  req["jsonrpc"] = "2.0"
  req["method"] = "eth_call"
  var param = {}
  param['to'] = contractAddress
  param['data'] = '0x70a0823100000000000000000000000010aae3635324ed530b5399984552a020e6d2cd77'
  req["params"] = [param,  'latest']
  req["id"] = 1
  this.makePostRequest(JSON.stringify(req), function(error, balance) {
    if (error) {
      return callback(error)
    }
    balance = parseInt(balance, 16)
    return callback(null, balance)
  })
}




module.exports = Infura;