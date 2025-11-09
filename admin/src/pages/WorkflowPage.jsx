import React, { useEffect, useState } from 'react'
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material'
import { listJobs, getJob, retryJob, removeJob } from '../api'

export default function WorkflowPage(){
  const [jobs, setJobs] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const limit = 50

  useEffect(() => { refresh() }, [page])

  async function refresh(){
    setLoading(true)
    try {
      const res = await listJobs({ page, limit })
      setJobs(res.jobs || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function showJob(id){
    const j = await getJob(id)
    setSelected(j)
  }

  async function doRetry(id){ await retryJob(id); await refresh(); if (selected && selected.id === id) await showJob(id) }
  async function doRemove(id){ await removeJob(id); await refresh(); if (selected && selected.id === id) setSelected(null) }

  return (
    <Box sx={{p:3}}>
      <Typography variant="h4" gutterBottom>Workflow</Typography>
      <TableContainer component={Paper} sx={{mb:2}}>
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
              <TableRow key={j.id}>
                <TableCell>{j.id}</TableCell>
                <TableCell>{j.state}</TableCell>
                <TableCell>{j.attemptsMade}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => showJob(j.id)}>View</Button>
                  <Button size="small" sx={{ ml:1 }} onClick={() => doRetry(j.id)}>Retry</Button>
                  <Button size="small" sx={{ ml:1 }} onClick={() => doRemove(j.id)}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{p:2}}>
        {selected ? (<Box>
          <Typography variant="h6">Job {selected.id}</Typography>
          <Box component="pre" sx={{whiteSpace:'pre-wrap'}}>{JSON.stringify(selected, null, 2)}</Box>
        </Box>) : (<div>Select a job to view</div>)}
      </Paper>
    </Box>
  )
}
