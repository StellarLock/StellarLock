import { useEffect } from "react"
import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Layout } from "@/components/layout/Layout"
import { Landing } from "@/pages/Landing"
import { CreateLock } from "@/pages/CreateLock"
import { MyLocks } from "@/pages/MyLocks"
import { LockDetail } from "@/pages/LockDetail"
import { Explorer } from "@/pages/Explorer"
import { History } from "@/pages/History"
import { trackPageView } from "@/lib/analytics"

export function App() {
  const location = useLocation()

  useEffect(() => {
    trackPageView()
  }, [location.pathname])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/app/create" element={<CreateLock />} />
        <Route path="/app/locks" element={<MyLocks />} />
        <Route path="/app/lock/:id" element={<LockDetail />} />
        <Route path="/app/history" element={<History />} />
        <Route path="/explore/:token" element={<Explorer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
