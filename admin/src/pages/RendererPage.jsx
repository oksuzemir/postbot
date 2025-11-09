import React, { useEffect, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_BASE || ''
import { Box, Typography, Select, MenuItem, Button } from '@mui/material'

export default function RendererPage() {
  const [templates, setTemplates] = useState([])
  const [mocks, setMocks] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedMock, setSelectedMock] = useState('')
  const [renderUrl, setRenderUrl] = useState(null)

  useEffect(() => { loadTemplates(); loadMocks() }, [])

  async function loadTemplates() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/templates`, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) return
      const j = await res.json()
      setTemplates(j.templates || [])
    } catch (e) { console.error(e) }
  }

  async function loadMocks() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/mocks`, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) return
      const j = await res.json()
      setMocks(j.mocks || [])
    } catch (e) { console.error(e) }
  }

  async function renderWithMock() {
    if (!selectedTemplate || !selectedMock) { alert('Select template and mock'); return }
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      // fetch mock
      const gm = await fetch(`${API_BASE}/mocks/` + encodeURIComponent(selectedMock), { headers: k ? { 'x-api-key': k } : {} })
      const jm = await gm.json()
      // render
      const res = await fetch(`${API_BASE}/render/from-data`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ template: selectedTemplate, data: jm.json }) })
      if (!res.ok) throw new Error('render failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setRenderUrl(url)
    } catch (e) { console.error(e); alert('Render failed: ' + (e && e.message)) }
  }

  return (
    <Box sx={{p:3}}>
      <Typography variant="h4" gutterBottom>Renderer</Typography>
      <Box sx={{display:'flex', gap:2, alignItems:'center', mb:2, flexDirection:{xs:'column', sm:'row'}}}>
        <Select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} displayEmpty sx={{minWidth:300, width:{xs:'100%', sm:'auto'}}}>
          <MenuItem value="">Select template</MenuItem>
          {templates.map(t => (<MenuItem key={t.name} value={t.template}>{t.name}</MenuItem>))}
        </Select>
        <Select value={selectedMock} onChange={e => setSelectedMock(e.target.value)} displayEmpty sx={{minWidth:220, width:{xs:'100%', sm:'auto'}}}>
          <MenuItem value="">Select mock</MenuItem>
          {mocks.map(m => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
        </Select>
        <Button variant="contained" onClick={renderWithMock} sx={{width:{xs:'100%', sm:'auto'}}}>Render</Button>
      </Box>
      <Box>
        {renderUrl ? (<img src={renderUrl} alt="render" style={{maxWidth:'100%'}} />) : (<Typography>No render yet</Typography>)}
      </Box>
    </Box>
  )
}
