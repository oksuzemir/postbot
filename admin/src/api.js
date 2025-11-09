const API_BASE = import.meta.env.VITE_API_BASE || ''

function getApiKey() {
  return window.localStorage.getItem('postbot_api_key') || ''
}

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const k = getApiKey()
  if (k) h['x-api-key'] = k
  return h
}

export async function listJobs({ page = 0, limit = 50 } = {}) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) })
  const res = await fetch(`${API_BASE}/jobs?${q.toString()}`, { headers: headers() })
  if (!res.ok) throw new Error('list jobs failed')
  return res.json()
}

export async function getJob(id) {
  const res = await fetch(`${API_BASE}/jobs/${id}`, { headers: headers() })
  if (!res.ok) throw new Error('get job failed')
  return res.json()
}

export async function retryJob(id) {
  const res = await fetch(`${API_BASE}/jobs/${id}/retry`, { method: 'POST', headers: headers() })
  if (!res.ok) throw new Error('retry failed')
  return res.json()
}

export async function removeJob(id) {
  const res = await fetch(`${API_BASE}/jobs/${id}/remove`, { method: 'POST', headers: headers() })
  if (!res.ok) throw new Error('remove failed')
  return res.json()
}

export function setApiKey(key) {
  if (key) window.localStorage.setItem('postbot_api_key', key)
  else window.localStorage.removeItem('postbot_api_key')
}
