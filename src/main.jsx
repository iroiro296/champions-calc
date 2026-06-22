import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ChampionsDamageCalc from './ChampionsDamageCalc.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ChampionsDamageCalc />
  </StrictMode>,
)
