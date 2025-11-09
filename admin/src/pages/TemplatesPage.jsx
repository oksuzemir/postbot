import React from 'react'
import RenderPlayer from '../RenderPlayer'
import { Box, Typography } from '@mui/material'

export default function TemplatesPage() {
  return (
    <Box sx={{p:3}}>
      <Typography variant="h4" gutterBottom>Rendered Templates</Typography>
      <RenderPlayer />
    </Box>
  )
}
