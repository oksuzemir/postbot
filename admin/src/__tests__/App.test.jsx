import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// mock the api module used by App to avoid network calls
jest.mock('../api', () => ({
  listJobs: jest.fn().mockResolvedValue({ jobs: [] }),
  getJob: jest.fn(),
  retryJob: jest.fn(),
  removeJob: jest.fn(),
  setApiKey: jest.fn()
}))

import App from '../App'

describe('Admin App UI (simulations)', () => {
  // Provide a simple global.fetch mock so components that call fetch (RenderPlayer)
  // don't throw in the jsdom/Jest environment.
  beforeAll(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) })
  })

  afterAll(() => {
    delete global.fetch
  })
  test('shows presigned S3 link when simulatePresigned is clicked', async () => {
    render(<App />)
  // wait for the header simulation button to be available
  await waitFor(() => expect(screen.getByText('Simulate S3 Presigned')).toBeInTheDocument())
    const btn = screen.getByText('Simulate S3 Presigned')
    fireEvent.click(btn)
    // Should show S3 code and Open link
    expect(await screen.findByText(/S3:/)).toBeInTheDocument()
    const open = screen.getByRole('link', { name: /Open/i })
    expect(open).toBeInTheDocument()
    expect(open.href).toContain('https://example.com/presigned/simulated-123.png')
  const expiryMatches = screen.getAllByText(/expires/)
  expect(expiryMatches.length).toBeGreaterThan(0)
  })

  test('shows outPath download button when simulateOutPath is clicked', async () => {
    render(<App />)
  await waitFor(() => expect(screen.getByText('Simulate outPath')).toBeInTheDocument())
    const btn = screen.getByText('Simulate outPath')
    fireEvent.click(btn)
    // filename should appear as button text
    expect(await screen.findByText('simulated-456.png')).toBeInTheDocument()
  })
})
