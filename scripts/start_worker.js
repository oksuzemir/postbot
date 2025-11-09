const waitForRedis = require('./wait-for-redis');
const { startWorker } = require('../src/queue');

(async function() {
	try {
		const redisHost = process.env.REDIS_HOST || '127.0.0.1';
		const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
		console.log(`Waiting for Redis at ${redisHost}:${redisPort}...`);
		await waitForRedis(redisHost, redisPort, 40, 500);
		console.log('Redis is available — starting worker');
		const worker = startWorker();

		// log process signals so we can see if something is killing the worker
		process.on('SIGINT', () => {
			console.log('[start_worker] SIGINT received');
		});
		process.on('SIGTERM', () => {
			console.log('[start_worker] SIGTERM received');
		});
		process.on('uncaughtException', (err) => {
			console.error('[start_worker] uncaughtException', err && err.stack ? err.stack : err);
		});
		process.on('unhandledRejection', (r) => {
			console.error('[start_worker] unhandledRejection', r && r.stack ? r.stack : r);
		});
	} catch (e) {
		console.error('Could not start worker — Redis unavailable', e);
		process.exit(1);
	}
})();
