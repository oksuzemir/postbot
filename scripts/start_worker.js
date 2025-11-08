const waitForRedis = require('./wait-for-redis');
const { startWorker } = require('../src/queue');

(async function() {
	try {
		const redisHost = process.env.REDIS_HOST || '127.0.0.1';
		const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
		console.log(`Waiting for Redis at ${redisHost}:${redisPort}...`);
		await waitForRedis(redisHost, redisPort, 40, 500);
		console.log('Redis is available — starting worker');
		startWorker();
	} catch (e) {
		console.error('Could not start worker — Redis unavailable', e);
		process.exit(1);
	}
})();
