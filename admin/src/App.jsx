import React, { useEffect, useState } from 'react'
import { listJobs, getJob, retryJob, removeJob } from './api'
import RenderPlayer from './RenderPlayer'
import ApiPage from './pages/ApiPage'
import TemplatesPage from './pages/TemplatesPage'
import RendererPage from './pages/RendererPage'
import WorkflowPage from './pages/WorkflowPage'
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
  // API key is managed on the API Console page now
  const [page, setPage] = useState(0)
  const [route, setRoute] = useState('workflow') // 'api' | 'templates' | 'renderer' | 'workflow'
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
          <AppBar position="fixed">
            <Toolbar variant="dense">
              <Box sx={{display:'flex', alignItems:'center', gap:2}}>
                <Typography variant="h6" component="div" sx={{fontWeight:600}}>
                  Postbot — Admin
                </Typography>
              </Box>

              <Box sx={{flex:1, display:'flex', justifyContent:'center', gap:2}}>
                <Button color="inherit" onClick={() => setRoute('api')} sx={{ textTransform: 'none', borderBottom: route === 'api' ? '2px solid rgba(255,255,255,0.9)' : 'none' }}>API</Button>
                <Button color="inherit" onClick={() => setRoute('templates')} sx={{ textTransform: 'none', borderBottom: route === 'templates' ? '2px solid rgba(255,255,255,0.9)' : 'none' }}>Rendered Templates</Button>
                <Button color="inherit" onClick={() => setRoute('renderer')} sx={{ textTransform: 'none', borderBottom: route === 'renderer' ? '2px solid rgba(255,255,255,0.9)' : 'none' }}>Renderer</Button>
                <Button color="inherit" onClick={() => setRoute('workflow')} sx={{ textTransform: 'none', borderBottom: route === 'workflow' ? '2px solid rgba(255,255,255,0.9)' : 'none' }}>Workflow</Button>
              </Box>
              {/* right side intentionally left empty; API key is managed on the API Console page */}
            </Toolbar>
          </AppBar>

          {/* Toolbar spacer to offset fixed AppBar so main content sits below it */}
          <Toolbar variant="dense" />

          <main>
          {route === 'api' ? (<ApiPage />) : route === 'templates' ? (<TemplatesPage />) : route === 'renderer' ? (<RendererPage />) : (<WorkflowPage />)}
      </main>
        </div>
      </NotificationProvider>
    </ThemeProvider>
  )
}

// RenderPlayer moved to its own component file
