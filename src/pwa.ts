import { registerSW } from 'virtual:pwa-register'

/**
 * Keeps an installed copy current. A phone tends to resume the home-screen app from memory
 * rather than reloading it, so without this it can keep showing an old version for weeks.
 * Checks for a new version on start, whenever the app comes back to the foreground, and hourly;
 * a found update reloads the page (the study is auto-saved, so nothing is lost).
 */
export function keepAppUpdated() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, 60 * 60 * 1000)
    },
  })
}
