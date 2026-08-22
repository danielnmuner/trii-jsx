import { Navigate, Route, Routes } from 'react-router-dom'
import { AnalyticsPage } from '../../features/analytics/pages/AnalyticsPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<AnalyticsPage />} />
      <Route path="/analytics" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
