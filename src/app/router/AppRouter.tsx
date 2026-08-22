import { Navigate, Route, Routes } from 'react-router-dom'
import { AnalyticsPage } from '../../features/analytics/pages/AnalyticsPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/analytics" replace />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
    </Routes>
  )
}
