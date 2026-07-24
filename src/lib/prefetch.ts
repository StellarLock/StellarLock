// Module prefetch helpers — call on hover/focus to warm chunks before navigation.
export const prefetch = {
  landing: () => import("@/pages/Landing"),
  createLock: () => import("@/pages/CreateLock"),
  myLocks: () => import("@/pages/MyLocks"),
  discover: () => import("@/pages/Discover"),
  history: () => import("@/pages/History"),
}
