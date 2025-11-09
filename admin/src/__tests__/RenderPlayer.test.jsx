import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import RenderPlayer from '../RenderPlayer'

// create mocks we can inspect in tests (names prefixed with `mock` are allowed in jest.mock factory)
const mockShowNotification = jest.fn()
const mockShowConfirm = jest.fn(() => Promise.resolve(true))

jest.mock('../ui/NotificationProvider', () => ({
  useNotifications: () => ({ showNotification: mockShowNotification, showConfirm: mockShowConfirm }),
}))

describe('RenderPlayer component', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    mockShowNotification.mockReset()
    mockShowConfirm.mockReset()
  })

  test('shows template list from /templates', async () => {
    global.fetch = jest.fn((url, opts) => {
      if (url === '/templates') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [ { name: 'foo', template: { foo: 1 } }, { name: 'bar', template: { bar: 2 } } ] }) })
      }
      return Promise.resolve({ ok: true, blob: () => new Blob(['']) })
    })

    render(<RenderPlayer />)

    // wait for the templates to be fetched and rendered
    await waitFor(() => expect(screen.getByText('foo')).toBeInTheDocument())

    // template names should appear
    expect(screen.getByText('foo')).toBeInTheDocument()
    expect(screen.getByText('bar')).toBeInTheDocument()

    // action buttons for a template should be present (render button)
    const renderButtons = screen.getAllByTitle('Render')
    expect(renderButtons.length).toBeGreaterThanOrEqual(1)
  })

  test('renders image when clicking Render button', async () => {
    // mock createObjectURL since component uses it
    global.URL.createObjectURL = jest.fn(() => 'blob:fake')

    global.fetch = jest.fn((url, opts) => {
      if (url === '/templates') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [ { name: 'foo', template: { foo: 1 } } ] }) })
      }
      if (url === '/render/admin-static') {
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['png'])) })
      }
      return Promise.resolve({ ok: true })
    })

    render(<RenderPlayer />)

    await waitFor(() => expect(screen.getByText('foo')).toBeInTheDocument())

    const renderBtn = screen.getByTitle('Render')
    fireEvent.click(renderBtn)

    // POST to render endpoint
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/render/admin-static', expect.objectContaining({ method: 'POST' })))

    // image should appear
    await waitFor(() => expect(screen.getByAltText('render')).toBeInTheDocument())
  })

  test('delete template after confirm', async () => {
  mockShowConfirm.mockResolvedValue(true)

    global.fetch = jest.fn((url, opts) => {
      if (url === '/templates') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [ { name: 'foo', template: {} } ] }) })
      }
      if (opts && opts.method === 'DELETE') {
        return Promise.resolve({ ok: true })
      }
      return Promise.resolve({ ok: true })
    })

    render(<RenderPlayer />)

    await waitFor(() => expect(screen.getByText('foo')).toBeInTheDocument())

    const delBtn = screen.getByTitle('Delete')
    fireEvent.click(delBtn)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/templates/foo', expect.objectContaining({ method: 'DELETE' })))

  // notification should be shown
  await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith('Deleted foo', 'success'))
  })

  test('shows JSON parse error when typing invalid JSON', async () => {
    global.fetch = jest.fn((url, opts) => {
      if (url === '/templates') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) })
      }
      return Promise.resolve({ ok: true })
    })

    render(<RenderPlayer />)

    // find the textarea by label
    const textarea = await screen.findByLabelText('Template JSON')
    fireEvent.change(textarea, { target: { value: '{ invalid json' } })

    await waitFor(() => expect(screen.getByText(/JSON parse error/i)).toBeInTheDocument())
  })
})
