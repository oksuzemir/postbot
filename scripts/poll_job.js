#!/usr/bin/env node
// Poll a job until it completes or fails (timeout ~2 minutes)
const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/poll_job.js <jobId>');
  process.exit(2);
}

(async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:3000/jobs/${id}`);
      if (!res.ok) {
        const txt = await res.text();
        console.error('Fetch failed', res.status, txt);
      } else {
        const j = await res.json();
        console.log(new Date().toISOString(), j.state || 'no-state');
        if (j.state === 'completed') {
          console.log('COMPLETED');
          console.log(JSON.stringify(j, null, 2));
          process.exit(0);
        }
        if (j.state === 'failed') {
          console.error('FAILED');
          console.error(JSON.stringify(j, null, 2));
          process.exit(3);
        }
      }
    } catch (e) {
      console.error('Err', e && e.message ? e.message : e);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error('Timeout waiting for job completion');
  process.exit(4);
})();
