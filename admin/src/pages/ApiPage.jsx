import React, { useEffect, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_BASE || ''
import { useNotifications } from '../ui/NotificationProvider'
import { setApiKey } from '../api'
import {
  Box,
  Button,
  TextField,
  Select,
  MenuItem,
  Typography,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  CircularProgress,
  Tooltip,
  Divider,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

export default function ApiPage() {
  const { showNotification, showConfirm } = useNotifications()
  const [apiKey, setApiKeyState] = useState(window.localStorage.getItem('postbot_api_key') || '')
  const [presets, setPresets] = useState([])
  const [apiUrl, setApiUrl] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [headersParseError, setHeadersParseError] = useState('')
  const [preview, setPreview] = useState(null)
  const [presetName, setPresetName] = useState('')

  // mocks & dialog state
  const [mocks, setMocks] = useState([])
  const [selectedMockName, setSelectedMockName] = useState('')
  const [previewSource, setPreviewSource] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [mockDialogOpen, setMockDialogOpen] = useState(false)
  const [mockDialogMode, setMockDialogMode] = useState('save')
  const [mockDialogValue, setMockDialogValue] = useState('')
  const [mockDialogTarget, setMockDialogTarget] = useState('')
  const [mockOpLoading, setMockOpLoading] = useState(false)

  useEffect(() => { loadPresets(); loadMocks(); }, [])

  async function loadPresets() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/api-presets`, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) return
      const j = await res.json()
      setPresets(j.presets || [])
    } catch (e) { console.error(e) }
  }

  async function loadMocks() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/mocks`, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) { console.error('loadMocks non-ok', res.status); return }
      const j = await res.json()
      setMocks(j.mocks || [])
    } catch (e) { console.error('loadMocks failed', e) }
  }

  async function fetchPreview() {
    if (!apiUrl) { showNotification('API URL required', 'error'); return }
    setPreviewLoading(true)
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      let headersObj = {}
      setHeadersParseError('')
      if (headersText && headersText.trim()) {
        try { headersObj = JSON.parse(headersText) } catch (e) { setHeadersParseError(e && e.message ? e.message : String(e)); showNotification('Headers JSON invalid','error'); setPreviewLoading(false); return }
      }
      const body = { apiUrl, headers: headersObj }
      if (presetName) body.presetName = presetName
      const res = await fetch(`${API_BASE}/fetch-proxy`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error((j && j.error) || `fetch failed: ${res.status}`)
      setPreview(j.data)
      setPreviewSource(j.source || 'live')
      showNotification('Preview fetched (' + (j.source || 'live') + ')', 'success')
    } catch (e) {
      console.error('fetchPreview', e)
      showNotification('Fetch failed: ' + (e && e.message), 'error')
    } finally { setPreviewLoading(false) }
  }

  function saveApiKey() {
    try {
      setApiKey(apiKey)
      setApiKeyState(apiKey)
      showNotification('API key saved', 'success')
    } catch (e) {
      console.error('saveApiKey failed', e)
      showNotification('Failed to save API key', 'error')
    }
  }

  function clearApiKey() {
    (async () => {
      try {
        const ok = await showConfirm('Clear saved API key?')
        if (!ok) return
        setApiKey('')
        setApiKeyState('')
        showNotification('API key cleared', 'success')
      } catch (e) {
        console.error('clearApiKey failed', e)
        showNotification('Failed to clear API key', 'error')
      }
    })()
  }

  // Save preview as mock. If `name` provided, use it directly; otherwise open save dialog
  async function savePreviewAsMock(name) {
    if (!preview) { showNotification('No preview data to save','error'); return }
    if (name && name.trim()) {
      try {
        const k = window.localStorage.getItem('postbot_api_key') || ''
        const res = await fetch(`${API_BASE}/mocks`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ name: name.trim(), json: preview }) })
        if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(t || 'save failed') }
        const j = await res.json()
        showNotification('Saved mock ' + j.saved, 'success')
        await loadMocks()
        setSelectedMockName(j.saved)
      } catch (e) {
        console.error('savePreviewAsMock failed', e)
        showNotification('Save mock failed: ' + (e && e.message), 'error')
      }
      return
    }
    setMockDialogMode('save')
    setMockDialogValue('preview_mock')
    setMockDialogTarget('')
    setMockDialogOpen(true)
  }

  async function deleteMock(name) {
    if (!name) return
    const ok = await showConfirm('Delete mock ' + name + '?')
    if (!ok) return
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/mocks/` + encodeURIComponent(name), { method: 'DELETE', headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(t || 'delete failed') }
      await loadMocks()
      if (selectedMockName === name) setSelectedMockName('')
      showNotification('Deleted mock ' + name, 'success')
    } catch (e) {
      console.error('deleteMock failed', e)
      showNotification('Delete mock failed: ' + (e && e.message), 'error')
    }
  }

  function renameMock(oldName) {
    if (!oldName) return
    setMockDialogMode('rename')
    setMockDialogValue(oldName)
    setMockDialogTarget(oldName)
    setMockDialogOpen(true)
  }

  function copyPreviewToClipboard() {
    if (!preview) { showNotification('No preview to copy', 'error'); return }
    try {
      const s = JSON.stringify(preview, null, 2)
      navigator.clipboard.writeText(s)
      showNotification('Preview JSON copied to clipboard', 'success')
    } catch (e) {
      console.error('copy failed', e)
      showNotification('Copy failed: ' + (e && e.message), 'error')
    }
  }

  async function handleMockDialogConfirm() {
    const val = mockDialogValue && mockDialogValue.trim()
    if (!val) { showNotification('Name required', 'error'); return }
    setMockOpLoading(true)
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      if (mockDialogMode === 'save') {
        const res = await fetch(`${API_BASE}/mocks`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ name: val, json: preview }) })
        if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(t || 'save failed') }
        const j = await res.json()
        await loadMocks()
        setSelectedMockName(j.saved)
        showNotification('Saved mock ' + j.saved, 'success')
      } else if (mockDialogMode === 'rename') {
        const res = await fetch(`${API_BASE}/mocks/` + encodeURIComponent(mockDialogTarget), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ newName: val }) })
        if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(t || 'rename failed') }
        const j = await res.json()
        await loadMocks()
        setSelectedMockName(j.renamed ? j.renamed.to : val)
        showNotification('Renamed mock ' + mockDialogTarget + ' -> ' + (j.renamed ? j.renamed.to : val), 'success')
      }
      setMockDialogOpen(false)
    } catch (e) {
      console.error('mock dialog action failed', e)
      showNotification((mockDialogMode === 'save' ? 'Save' : 'Rename') + ' failed: ' + (e && e.message), 'error')
    } finally { setMockOpLoading(false) }
  }

  function handleMockDialogCancel() { setMockDialogOpen(false) }

  return (
    <Box sx={{display:'flex', flexDirection:'column', p:0}}>
      <Box component="header" sx={{p:3, borderBottom:1, borderColor:'divider', backgroundColor:'background.paper'}}>
        <Typography variant="h3" gutterBottom sx={{fontWeight:600}}>API Console</Typography>
        <Typography variant="body2" color="text.secondary">Use this page to test API endpoints, manage saved response mocks, and preview response JSON.</Typography>
      </Box>

      <Box component="main" sx={{p:3, flex:1, overflow:'auto', display:'flex', flexDirection:'column', gap:2}}>
        <Card sx={{mb:2}}>
          <CardContent>
            <Typography variant="subtitle1">API settings</Typography>
            <Box sx={{display:'flex', gap:2, alignItems:'center', mt:1, flexDirection:{ xs: 'column', sm: 'row' }}}>
              <TextField size="small" label="API key" value={apiKey} onChange={e => setApiKeyState(e.target.value)} placeholder="x-api-key or leave empty" sx={{width:{xs:'100%', sm:360}}} />
              <Button size="small" variant="contained" onClick={saveApiKey} sx={{width:{xs:'100%', sm:'auto'}}}>Save key</Button>
              <Button size="small" variant="outlined" onClick={clearApiKey} disabled={!apiKey} sx={{width:{xs:'100%', sm:'auto'}}}>Clear</Button>
            </Box>
            <Divider sx={{my:1}} />
            <Typography variant="subtitle1">Presets</Typography>
          <Select value={presetName} onChange={e => setPresetName(e.target.value)} displayEmpty sx={{minWidth:240, mt:1, width:{xs:'100%', sm:'auto'}}}>
            <MenuItem value="">(no preset)</MenuItem>
            {presets.map(p => (<MenuItem key={p.name} value={p.name}>{p.name} ({p.header})</MenuItem>))}
          </Select>
          <Box sx={{mt:2}}>
            <TextField fullWidth value={apiUrl} onChange={e => setApiUrl(e.target.value)} label="API URL" size="small" placeholder="https://example.com/api/endpoint" />
          </Box>
          <Box sx={{mt:1}}>
            <TextField fullWidth multiline minRows={3} value={headersText} onChange={e => setHeadersText(e.target.value)} label="Headers (JSON)" size="small" placeholder='{"Authorization":"Bearer ..."}' error={!!headersParseError} helperText={headersParseError || ''} />
          </Box>
          <Box sx={{mt:2, display:'flex', gap:2, alignItems:'center', flexDirection:{ xs: 'column', sm: 'row' }}}>
            <Button variant="contained" onClick={fetchPreview} disabled={previewLoading} sx={{width:{xs:'100%', sm:'auto'}}}>{previewLoading ? (<><CircularProgress size={16} sx={{mr:1}} />Fetching...</>) : 'Fetch preview'}</Button>
            <Button variant="outlined" onClick={() => savePreviewAsMock('preview_mock')} disabled={!preview} sx={{width:{xs:'100%', sm:'auto'}}}>Save as mock</Button>
            {previewLoading ? <Typography variant="caption" color="text.secondary">Contacting remote API...</Typography> : null}
          </Box>
        </CardContent>
      </Card>
        <Card sx={{mb:0, flex: '0 0 auto'}}>
          <CardContent>
            <Box sx={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:2}}>
              <Typography variant="subtitle1">Preview {previewSource ? `— source: ${previewSource}` : ''}</Typography>
              <Box>
                <Tooltip title="Copy preview JSON">
                  <span>
                    <IconButton size="small" onClick={copyPreviewToClipboard} disabled={!preview}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
            <Divider sx={{my:1}} />
            <Box sx={{flex:1}}>
                <Box component="pre" sx={{maxHeight:400, overflow:'auto', mt:1, background:'#f7f7f7', p:1, borderRadius:1}}>{preview ? JSON.stringify(preview, null, 2) : 'No preview loaded'}</Box>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{mb:0}}>
          <CardContent>
            <Typography variant="subtitle1">Saved mocks</Typography>
            <Box sx={{display:'flex', gap:2, alignItems:'center', mt:1, flexDirection:{ xs: 'column', sm: 'row' }}}>
              <Select size="small" value={selectedMockName} onChange={e => setSelectedMockName(e.target.value)} displayEmpty sx={{minWidth:240, width:{xs:'100%', sm:'auto'}}}>
                <MenuItem value="">(no mock)</MenuItem>
                {mocks.map(m => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
              </Select>
              <Button size="small" onClick={async () => {
                if (!selectedMockName) { showNotification('Select a mock first','error'); return }
                try {
                  const k = window.localStorage.getItem('postbot_api_key') || ''
                  const res = await fetch(`${API_BASE}/mocks/` + encodeURIComponent(selectedMockName), { headers: k ? { 'x-api-key': k } : {} })
                  if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(t || 'failed to load mock') }
                  const j = await res.json()
                  setPreview(j.json)
                  setPreviewSource('mock')
                  showNotification('Loaded mock into preview: ' + selectedMockName, 'success')
                } catch (e) {
                  console.error('load mock into preview failed', e)
                  showNotification('Load mock failed: ' + (e && e.message), 'error')
                }
              }} sx={{width:{xs:'100%', sm:'auto'}}}>Load mock</Button>
              <Button size="small" onClick={() => savePreviewAsMock()} disabled={!preview} sx={{width:{xs:'100%', sm:'auto'}}}>Save as mock</Button>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{flex:1}}>
          <CardContent sx={{height:'100%', display:'flex', flexDirection:'column'}}>
            <Typography variant="subtitle2">Manage mocks</Typography>
            <Box sx={{mt:1, overflow:'auto'}}>
              {mocks.length === 0 ? (<Typography variant="caption">No saved mocks</Typography>) : (
                <List>
                  {mocks.map(m => (
                    <ListItem key={m} secondaryAction={(
                      <Box>
                        <IconButton size="small" title="Rename" onClick={() => renameMock(m)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" title="Delete" onClick={() => deleteMock(m)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )}>
                      <ListItemText primary={m} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            <Dialog open={mockDialogOpen} onClose={handleMockDialogCancel} fullWidth maxWidth="xs">
              <DialogTitle>{mockDialogMode === 'save' ? 'Save mock' : 'Rename mock'}</DialogTitle>
              <DialogContent>
                <Box sx={{mt:1}}>
                  <TextField autoFocus fullWidth size="small" label={mockDialogMode === 'save' ? 'Mock name' : 'New name'} value={mockDialogValue} onChange={e => setMockDialogValue(e.target.value)} />
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleMockDialogCancel} disabled={mockOpLoading}>Cancel</Button>
                <Button onClick={handleMockDialogConfirm} variant="contained" disabled={mockOpLoading}>{mockOpLoading ? 'Working...' : (mockDialogMode === 'save' ? 'Save' : 'Rename')}</Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}
