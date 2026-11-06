import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorNoticeHost from './components/ErrorNoticeHost'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <ErrorNoticeHost />
  </React.StrictMode>,
)
