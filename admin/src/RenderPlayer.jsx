import React, { useEffect, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_BASE || ''
import { useNotifications } from './ui/NotificationProvider'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import { GridLegacy } from '@mui/material'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import EditIcon from '@mui/icons-material/Edit'
import VisibilityIcon from '@mui/icons-material/Visibility'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

export default function RenderPlayer() {
  const [templates, setTemplates] = useState([])
  const [tplLoading, setTplLoading] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importName, setImportName] = useState('new_template')
  const [renderingImgUrl, setRenderingImgUrl] = useState(null)
  const [importParseError, setImportParseError] = useState(null)
  const [parsedImport, setParsedImport] = useState(null)
  const [editingName, setEditingName] = useState(null)
  const [originalJson, setOriginalJson] = useState('')
  const [presets, setPresets] = useState([])
  const [mocks, setMocks] = useState([])
  const [apiUrl, setApiUrl] = useState('')
  const [presetName, setPresetName] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedMockName, setSelectedMockName] = useState('')
  const [previewSource, setPreviewSource] = useState('')
  const [mockDialogOpen, setMockDialogOpen] = useState(false)
  const [mockDialogMode, setMockDialogMode] = useState('save') // 'save' | 'rename'
  const [mockDialogValue, setMockDialogValue] = useState('')
  const [mockDialogTarget, setMockDialogTarget] = useState('')
  const [mockOpLoading, setMockOpLoading] = useState(false)
  const { showNotification, showConfirm } = useNotifications()

  useEffect(() => { fetchTemplates() }, [])

  // validate import JSON as the user types
  useEffect(() => {
    if (!importJson || importJson.trim() === '') {
      setImportParseError(null)
      return
    }
    try {
      const parsed = JSON.parse(importJson)
      setParsedImport(parsed)
      setImportParseError(null)
    } catch (err) {
      setParsedImport(null)
      setImportParseError(err.message || String(err))
    }
  }, [importJson])

  // quick ping to help debug connectivity from the admin UI
  async function checkApi() {
    const k = window.localStorage.getItem('postbot_api_key') || ''
    const headersOpt = k ? { 'x-api-key': k } : {}
    const candidates = [`${API_BASE}/health`, `${API_BASE}/templates`]
    let lastErr = null
    for (const u of candidates) {
      try {
        const res = await fetch(u, { headers: headersOpt })
        const txt = await res.text().catch(() => '')
        console.log('API ping', { url: u, status: res.status, statusText: res.statusText, body: txt })
        if (res.ok) {
          showNotification(`API reachable: ${u} — ${res.status} ${res.statusText}`, 'success')
          return
        }
        // try next candidate if not ok (e.g., 404 on /health)
        lastErr = new Error(`non-ok status ${res.status} ${res.statusText} from ${u}`)
      } catch (e) {
        console.error('API ping failed for', u, e)
        lastErr = e
      }
    }
    console.error('API ping complete, no candidate returned ok', { attempted: candidates, lastError: lastErr })
    showNotification('API ping failed — see console for details', 'error')
  }

  useEffect(() => { loadPresets(); loadMocks(); }, [])

  async function loadPresets() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/api-presets`, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) return
      const j = await res.json()
      setPresets(j.presets || [])
    } catch (e) {
      console.error('loadPresets failed', e)
    }
  }

  async function loadMocks() {
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(`${API_BASE}/mocks`, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) return
      const j = await res.json()
      setMocks(j.mocks || [])
    } catch (e) {
      console.error('loadMocks failed', e)
    }
  }

  async function fetchPreview() {
    if (!apiUrl) { showNotification('API URL required', 'error'); return }
    setPreviewLoading(true)
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      let headersObj = {}
      if (headersText && headersText.trim()) {
        try { headersObj = JSON.parse(headersText) } catch (e) { showNotification('Headers JSON invalid','error'); setPreviewLoading(false); return }
      }
      const body = { apiUrl, headers: headersObj }
      if (presetName) body.presetName = presetName
      const res = await fetch(`${API_BASE}/fetch-proxy`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        throw new Error((j && j.error) || `fetch failed: ${res.status}`)
      }
      setPreviewData(j.data)
      setPreviewSource(j.source || 'live')
      showNotification('Preview fetched (' + (j.source || 'live') + ')', 'success')
    } catch (e) {
      console.error('fetchPreview failed', e)
      showNotification('Fetch preview failed: ' + (e && e.message), 'error')
    } finally { setPreviewLoading(false) }
  }

  // Save preview as mock. If `name` provided, use it directly; otherwise open the save dialog.
  async function savePreviewAsMock(name) {
    if (!previewData) { showNotification('No preview data to save','error'); return }
    if (name && name.trim()) {
      // direct save path
      try {
        const k = window.localStorage.getItem('postbot_api_key') || ''
        const res = await fetch(`${API_BASE}/mocks`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ name: name.trim(), json: previewData }) })
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
    // open dialog to prompt for name
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

  // Open rename dialog instead of prompt
  function renameMock(oldName) {
    if (!oldName) return
    setMockDialogMode('rename')
    setMockDialogValue(oldName)
    setMockDialogTarget(oldName)
    setMockDialogOpen(true)
  }

  // Called when user confirms in the mock dialog
  async function handleMockDialogConfirm() {
    const val = mockDialogValue && mockDialogValue.trim()
    if (!val) { showNotification('Name required', 'error'); return }
    setMockOpLoading(true)
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      if (mockDialogMode === 'save') {
        const res = await fetch(`${API_BASE}/mocks`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ name: val, json: previewData }) })
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
    } finally {
      setMockOpLoading(false)
    }
  }

  function handleMockDialogCancel() {
    setMockDialogOpen(false)
  }

  async function renderWithMock(tpl, mockName) {
    if (!mockName) { showNotification('No mock selected','error'); return }
    const k = window.localStorage.getItem('postbot_api_key') || ''
    try {
      // fetch the mock JSON from the server
      const gm = await fetch(`${API_BASE}/mocks/` + encodeURIComponent(mockName), { headers: k ? { 'x-api-key': k } : {} })
      if (!gm.ok) { const t = await gm.text().catch(()=>''); throw new Error('failed to load mock: '+t || gm.status) }
      const mockJson = await gm.json()
      const data = mockJson.json
      // now render from data
      const reqUrl = `${API_BASE}/render/from-data`
      setRenderingImgUrl(null)
      const res = await fetch(reqUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ template: tpl, data }) })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`render failed: ${res.status} ${res.statusText} ${txt}`)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      setRenderingImgUrl(blobUrl)
      showNotification('Rendered using mock ' + mockName, 'success')
    } catch (e) {
      console.error('renderWithMock error', e)
      showNotification('Render with mock failed: ' + (e && e.message), 'error')
    }
  }

  async function renderFromDataTemplate(tpl) {
    if (!previewData) { showNotification('No preview data to render','error'); return }
    const reqUrl = `${API_BASE}/render/from-data`
    try {
      setRenderingImgUrl(null)
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(reqUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ template: tpl, data: previewData }) })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`render failed: ${res.status} ${res.statusText} ${txt}`)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      setRenderingImgUrl(blobUrl)
    } catch (e) {
      console.error('renderFromDataTemplate error', { apiBase: API_BASE, attemptedUrl: reqUrl }, e)
      showNotification('Render failed from ' + (API_BASE || 'relative path') + ': ' + (e && e.message), 'error')
    }
  }

  async function fetchTemplates() {
    setTplLoading(true)
    const url = `${API_BASE}/templates`
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(url, { headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`failed to list templates: ${res.status} ${res.statusText} ${txt}`)
      }
      const j = await res.json()
      setTemplates(j.templates || [])
    } catch (e) {
      console.error('fetchTemplates error', { apiBase: API_BASE, attemptedUrl: url }, e)
      showNotification('Failed to fetch templates from ' + (API_BASE || 'relative path') + ': ' + (e && e.message), 'error')
    } finally { setTplLoading(false) }
  }

  async function renderTemplate(tpl) {
    const reqUrl = `${API_BASE}/render/admin-static`
    try {
      setRenderingImgUrl(null)
      const k = window.localStorage.getItem('postbot_api_key') || ''
      const res = await fetch(reqUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ template: tpl }) })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`render failed: ${res.status} ${res.statusText} ${txt}`)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      setRenderingImgUrl(blobUrl)
    } catch (e) {
      console.error('renderTemplate error', { apiBase: API_BASE, attemptedUrl: reqUrl }, e)
      showNotification('Render failed from ' + (API_BASE || 'relative path') + ': ' + (e && e.message), 'error')
    }
  }

  function loadForEdit(name, tpl) {
    setImportName(name)
    try {
      const s = JSON.stringify(tpl, null, 2)
      setImportJson(s)
      setParsedImport(tpl)
      setImportParseError(null)
      setOriginalJson(s)
    } catch (err) {
      setImportJson('')
      setParsedImport(null)
      setImportParseError('Failed to stringify template')
    }
    setEditingName(name)
  }

  function cancelEdit() {
    setEditingName(null)
    setImportJson('')
    setImportName('new_template')
    setParsedImport(null)
    setImportParseError(null)
  }

  function viewTemplate(tpl) {
    const s = JSON.stringify(tpl, null, 2)
    const w = window.open('', '_blank')
    if (w) {
      w.document.title = 'Template'
      const pre = w.document.createElement('pre')
      pre.textContent = s
      w.document.body.appendChild(pre)
    } else {
      showNotification('Popup blocked; open in new tab to view template', 'error')
    }
  }

  async function deleteTemplate(name) {
    // ask for confirmation using inline modal (returns a promise)
    const ok = await showConfirm('Delete template ' + name + '?')
    if (!ok) return
    try {
      const k = window.localStorage.getItem('postbot_api_key') || ''
  const res = await fetch(`${API_BASE}/templates/` + encodeURIComponent(name), { method: 'DELETE', headers: k ? { 'x-api-key': k } : {} })
      if (!res.ok) throw new Error('delete failed')
      showNotification('Deleted ' + name, 'success')
      await fetchTemplates()
    } catch (e) {
      console.error(e)
      showNotification('Delete failed: ' + (e && e.message), 'error')
    }
  }

  async function importAndSave() {
    try {
      if (!parsedImport) {
        showNotification('Cannot save: invalid JSON', 'error')
        return
      }
      const name = importName || 'new_template'
      const k = window.localStorage.getItem('postbot_api_key') || ''
  const res = await fetch(`${API_BASE}/templates`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { 'x-api-key': k } : {}), body: JSON.stringify({ name, template: parsedImport }) })
      if (!res.ok) throw new Error('save failed')
      showNotification('Saved ' + name, 'success')
      cancelEdit()
      await fetchTemplates()
    } catch (e) {
      console.error(e)
      showNotification('Save failed: ' + (e && e.message), 'error')
    }
  }

  return (
    <Card>
      <CardContent>
        <GridLegacy container spacing={2}>
          <GridLegacy item xs={12}>
            <Typography variant="h5">Render Player Details</Typography>
          </GridLegacy>

          <GridLegacy item xs={12} md={6}>
            <Box sx={{display:'flex', justifyContent:'space-between', alignItems:'center', mb:1, flexDirection:{xs:'column', md:'row'}, gap:1}}>
              <Typography variant="subtitle1">Templates</Typography>
              <Box sx={{display:'flex', gap:1, width:{xs:'100%', md:'auto'}, justifyContent:{xs:'flex-start', md:'flex-end'}, flexDirection:{xs:'column', sm:'row'}}}>
                <Button size="small" onClick={fetchTemplates} disabled={tplLoading} startIcon={<PlayArrowIcon />} sx={{width:{xs:'100%', sm:'auto'}}}>{tplLoading ? 'Loading...' : 'Refresh templates'}</Button>
                <Button size="small" onClick={checkApi} sx={{ml:{xs:0, sm:1}, width:{xs:'100%', sm:'auto'}}}>Ping API</Button>
              </Box>
            </Box>
            <List>
              {templates.map(t => (
                <React.Fragment key={t.name}>
                  <ListItem secondaryAction={(
                    <Box>
                      <IconButton edge="end" aria-label="render" title="Render" onClick={() => renderTemplate(t.template)}>
                        <PlayArrowIcon />
                      </IconButton>
                      <IconButton edge="end" aria-label="render-data" title={!previewData ? 'No preview data' : 'Render with preview data'} onClick={() => renderFromDataTemplate(t.template)} disabled={!previewData}>
                        <PlayArrowIcon />
                      </IconButton>
                      <IconButton edge="end" aria-label="render-mock" title={selectedMockName ? `Render using mock ${selectedMockName}` : 'Select a mock to enable'} onClick={() => renderWithMock(t.template, selectedMockName)} disabled={!selectedMockName}>
                        <PlayArrowIcon />
                      </IconButton>
                      <IconButton edge="end" aria-label="edit" title="Edit" onClick={() => loadForEdit(t.name, t.template)}>
                        <EditIcon />
                      </IconButton>
                      <IconButton edge="end" aria-label="view" title="View" onClick={() => viewTemplate(t.template)}>
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton edge="end" aria-label="delete" title="Delete" onClick={() => deleteTemplate(t.name)}>
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  )}>
                    <ListItemText primary={t.name} />
                  </ListItem>
                  <Divider component="li" />
                </React.Fragment>
              ))}
            </List>
          </GridLegacy>

              <GridLegacy item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1">Import / Save Template</Typography>
                <Box sx={{display:'flex', gap:2, alignItems:'center', mt:1, flexDirection:{xs:'column', sm:'row'}}}>
                  <TextField size="small" value={importName} onChange={e => setImportName(e.target.value)} placeholder="template name" label="Template name" sx={{width:{xs:'100%', sm:'auto'}}} />
                  {editingName ? (<Typography variant="caption" color="text.secondary">Editing: {editingName}</Typography>) : null}
                  {editingName ? (<Button variant="outlined" size="small" onClick={cancelEdit} sx={{width:{xs:'100%', sm:'auto'}}}>Cancel</Button>) : null}
                </Box>
                <Box sx={{mt:1}}>
                  <TextField multiline minRows={10} value={importJson} onChange={e => setImportJson(e.target.value)} fullWidth placeholder="Paste template JSON here" label="Template JSON" variant="outlined" />
                </Box>
                <Box sx={{mt:1}}>
                  <Button variant="contained" onClick={importAndSave} disabled={!parsedImport || importJson.trim() === (originalJson || '').trim()}>{editingName ? 'Overwrite' : 'Save Template'}</Button>
                  {importParseError ? (<Typography color="error" sx={{mt:1}}>{'JSON parse error: ' + importParseError}</Typography>) : null}
                </Box>
              </CardContent>
            </Card>

            <Box sx={{mt:2}}>
              <Typography variant="subtitle1">API testing moved</Typography>
              <Typography variant="caption" color="text.secondary">The API preview and mock-management tools are now available on the API Console page.</Typography>
            </Box>

            <Box sx={{mt:2}}>
              <Typography variant="subtitle1">Render Output</Typography>
              {renderingImgUrl ? (
                <Box sx={{mt:1}}>
                  <img src={renderingImgUrl} alt="render" style={{maxWidth:'100%'}} />
                  <Box sx={{mt:1}}><Link href={renderingImgUrl} target="_blank" rel="noreferrer">Open in new tab</Link></Box>
                </Box>
              ) : <Typography>No render yet</Typography>}
            </Box>
          </GridLegacy>
        </GridLegacy>
      </CardContent>
      <CardActions />
    </Card>
  )
}
