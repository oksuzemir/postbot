#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const dirs = ['test-results', 'coverage']

for (const d of dirs) {
  const full = path.join(repoRoot, d)
  try {
    fs.mkdirSync(full, { recursive: true })
  } catch (err) {
    console.error('Failed to create directory', full, err)
    process.exit(1)
  }
}

console.log('Created/ensured directories:', dirs.join(', '))
