import React, { createContext, useContext, useState } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Button from '@mui/material/Button'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState(null)
  const [confirm, setConfirm] = useState(null)

  function showNotification(text, type = 'info', ttl = 4000) {
    setNotification({ text, type })
    if (ttl) setTimeout(() => setNotification(null), ttl)
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      setConfirm({ message, resolve })
    })
  }

  function handleConfirm(ok) {
    if (confirm && typeof confirm.resolve === 'function') confirm.resolve(ok)
    setConfirm(null)
  }

  return (
    <NotificationContext.Provider value={{ showNotification, showConfirm }}>
      {children}

      <Snackbar open={!!notification} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        {notification ? (
          <Alert severity={notification.type} variant="filled">{notification.text}</Alert>
        ) : null}
      </Snackbar>

      <Dialog open={!!confirm} onClose={() => handleConfirm(false)}>
        <DialogTitle>Confirm</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm ? confirm.message : ''}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleConfirm(false)}>Cancel</Button>
          <Button onClick={() => handleConfirm(true)} autoFocus>Confirm</Button>
        </DialogActions>
      </Dialog>
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
