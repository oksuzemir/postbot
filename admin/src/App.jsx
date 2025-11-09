import React, { useEffect, useState } from 'react'
import { listJobs, getJob, retryJob, removeJob, setApiKey } from './api'
import RenderPlayer from './RenderPlayer'
import { NotificationProvider } from './ui/NotificationProvider'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Link from '@mui/material/Link'

const theme = createTheme()

export default function App() {
  const [jobs, setJobs] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [apiKey, setKey] = useState(window.localStorage.getItem('postbot_api_key') || '')
  const [page, setPage] = useState(0)
  const [route, setRoute] = useState('jobs') // 'jobs' | 'render-player'
  const [limit] = useState(50)

  async function refresh() {
    setLoading(true)
    try {
      const res = await listJobs({ page, limit })
      setJobs(res.jobs || [])
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  

  async function showJob(id) {
    const j = await getJob(id)
    setSelected(j)
  }

  function saveKey() {
    setApiKey(apiKey)
    setKey(apiKey)
  }

  async function doRetry(id) {
    try {
      await retryJob(id)
      await refresh()
      if (selected && selected.id === id) await showJob(id)
    } catch (e) { console.error(e) }
  }

  async function doRemove(id) {
    try {
      await removeJob(id)
      await refresh()
      if (selected && selected.id === id) setSelected(null)
    } catch (e) { console.error(e) }
  }

  function prevPage() { setPage(p => Math.max(0, p - 1)) }
  function nextPage() { setPage(p => p + 1) }
  // Simulation helpers (UI-only) to test rendering without a backend
  function simulatePresigned() {
    const sample = {
      id: 'sim-ps-1',
      state: 'completed',
      attemptsMade: 1,
      result: {
        s3: {
          bucket: 'example-bucket',
          key: 'renders/simulated-123.png',
          presignedUrl: 'https://example.com/presigned/simulated-123.png?X-Amz-Signature=sim',
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
        }
      }
    }
    setSelected(sample)
  }

  function simulateOutPath() {
    const sample = {
      id: 'sim-out-1',
      state: 'completed',
      attemptsMade: 1,
      result: {
        outPath: 'out/simulated-456.png'
      }
    }
    setSelected(sample)
  }

  // Trigger server-side render using the admin static mapping and open the result
  async function simulateAdminStaticRender() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch('/render/admin-static', { method: 'POST', headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) throw new Error('render request failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      console.error(err)
      alert('Admin static render failed: ' + (err && err.message))
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <div className="app">
          <AppBar position="static">
            <Toolbar>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Postbot — Admin
              </Typography>
              <Button color="inherit" onClick={() => { refresh(); setRoute('jobs') }} disabled={loading}>{loading ? 'Refreshing...' : 'Jobs'}</Button>
              <Button color="inherit" onClick={() => setRoute('render-player')} sx={{ ml: 1 }}>Render Player Details</Button>
              <TextField size="small" placeholder="API Key" value={apiKey} onChange={e => setKey(e.target.value)} variant="standard" sx={{ ml: 2, bgcolor: 'transparent' }} />
              <Button color="inherit" onClick={saveKey} sx={{ ml: 1 }}>Save Key</Button>
              <Button color="inherit" onClick={() => simulatePresigned()} sx={{ ml: 2 }}>Simulate S3 Presigned</Button>
              <Button color="inherit" onClick={() => simulateOutPath()} sx={{ ml: 1 }}>Simulate outPath</Button>
              <Button color="inherit" onClick={() => simulateAdminStaticRender()} sx={{ ml: 2 }}>Render Admin Static</Button>
            </Toolbar>
          </AppBar>

          <main>
          {route === 'jobs' ? (
            <>
              <Box sx={{p:2}}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>State</TableCell>
                        <TableCell>Attempts</TableCell>
                        <TableCell>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {jobs.map(j => (
                        <TableRow key={j.id} sx={{ '&.completed': { bgcolor: '#f6ffed' } }}>
                          <TableCell>{j.id}</TableCell>
                          <TableCell>{j.state}</TableCell>
                          <TableCell>{j.attemptsMade}</TableCell>
                          <TableCell>
                            <Button size="small" onClick={() => showJob(j.id)}>View</Button>
                            <Button size="small" sx={{ ml: 1 }} onClick={() => doRetry(j.id)}>Retry</Button>
                            <Button size="small" sx={{ ml: 1 }} onClick={() => doRemove(j.id)}>Remove</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Box sx={{display:'flex', alignItems:'center', gap:2, px:2}}>
                <Button onClick={prevPage} disabled={page === 0}>Prev</Button>
                <Typography>Page {page + 1}</Typography>
                <Button onClick={nextPage}>Next</Button>
              </Box>

              <Box sx={{p:2}}>
                <Paper sx={{p:2}}>
                  {selected ? (
                    <div>
                      <Typography variant="h6">Job {selected.id}</Typography>
                      <Box sx={{mb:1}}>
                        <Typography component="span" sx={{mr:1}}><strong>State:</strong></Typography>{selected.state}
                        <Typography component="span" sx={{ml:2}}><strong>Attempts:</strong> {selected.attemptsMade}</Typography>
                      </Box>
                      <Box sx={{mb:1}}>
                        {selected.result && selected.result.outPath ? (() => {
                          try {
                            const parts = selected.result.outPath.split(/\\|\//)
                            const fn = parts[parts.length - 1]
                            return (<div>Download: <Button size="small" onClick={async () => {
                              try {
                                const k = window.localStorage.getItem('postbot_api_key') || ''
                                const res = await fetch(`/out/${encodeURIComponent(fn)}`, { headers: k ? { 'x-api-key': k } : {} })
                                if (!res.ok) throw new Error('fetch failed')
                                const blob = await res.blob()
                                const url = URL.createObjectURL(blob)
                                window.open(url, '_blank')
                              } catch (err) { console.error(err) }
                            }}>{fn}</Button></div>)
                          } catch (e) { return null }
                        })() : null}
                        {selected.result && selected.result.s3 ? (() => {
                          const s = selected.result.s3
                          const presigned = s.presignedUrl
                          const href = presigned || `https://${s.bucket}.s3.amazonaws.com/${encodeURIComponent(s.key)}`
                          return (
                            <div>
                              <Typography component="span">S3: </Typography><code>{s.bucket}/{s.key}</code>
                              &nbsp; <Link target="_blank" rel="noreferrer" href={href}>Open</Link>
                              {presigned && s.expiresAt ? (<Typography component="span" sx={{ml:1}}> (expires {s.expiresAt})</Typography>) : null}
                            </div>
                          )
                        })() : null}
                      </Box>
                      <Box component="pre" sx={{whiteSpace:'pre-wrap'}}>{JSON.stringify(selected, null, 2)}</Box>
                    </div>
                  ) : <div>Select a job to view details</div>}
                </Paper>
              </Box>
            </>
          ) : (
            <RenderPlayer />
          )}
      </main>
        </div>
      </NotificationProvider>
    </ThemeProvider>
  )
}

// RenderPlayer moved to its own component file
