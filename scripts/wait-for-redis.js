const net = require('net');

function waitForRedis(host='127.0.0.1', port=6379, retries=20, delayMs=500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryConnect = () => {
      attempts++;
      const sock = new net.Socket();
      sock.setTimeout(2000);
      sock.on('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        if (attempts >= retries) return reject(new Error('Redis not available'));
        setTimeout(tryConnect, delayMs);
      });
      sock.on('timeout', () => {
        sock.destroy();
        if (attempts >= retries) return reject(new Error('Redis timeout'));
        setTimeout(tryConnect, delayMs);
      });
      sock.connect(port, host);
    };
    tryConnect();
  });
}

module.exports = waitForRedis;
