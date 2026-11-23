const { Server } = require('node:net');

const listen = Server.prototype.listen;
Server.prototype.listen = function (port, host, callback) {
  if (!/^\d+$/.test(String(port)) || (typeof host !== 'function' && host !== '0.0.0.0')) {
    throw new Error('Unexpected listener configuration');
  }
  this.once('listening', () => process.send({ port: this.address().port }));
  return listen.call(this, 0, '127.0.0.1', typeof host === 'function' ? host : callback);
};
