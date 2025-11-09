import React, { useEffect, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_BASE || ''
import { useNotifications } from './ui/NotificationProvider'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
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
            <Box sx={{display:'flex', justifyContent:'space-between', alignItems:'center', mb:1}}>
              <Typography variant="subtitle1">Templates</Typography>
              <Box>
                <Button size="small" onClick={fetchTemplates} disabled={tplLoading} startIcon={<PlayArrowIcon />}>{tplLoading ? 'Loading...' : 'Refresh templates'}</Button>
                <Button size="small" onClick={checkApi} sx={{ml:1}}>Ping API</Button>
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
                <Box sx={{display:'flex', gap:2, alignItems:'center', mt:1}}>
                  <TextField size="small" value={importName} onChange={e => setImportName(e.target.value)} placeholder="template name" label="Template name" />
                  {editingName ? (<Typography variant="caption" color="text.secondary">Editing: {editingName}</Typography>) : null}
                  {editingName ? (<Button variant="outlined" size="small" onClick={cancelEdit}>Cancel</Button>) : null}
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
