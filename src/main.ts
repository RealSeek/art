import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { useAuthStore } from './stores/auth'
import './styles/tokens.css'
import './styles/main.css'
import './styles/workspace.css'
import './styles/landing.css'
import './styles/api.css'
import './styles/legal.css'
import './styles/prompt-library.css'
import './styles/office.css'
import './styles/plugins.css'
import './styles/canvas.css'
import './styles/image-prompt.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia).use(router).use(i18n)

async function bootstrap() {
  // Resolve the cookie-backed session before protected controls can be used.
  // A stalled backend must never prevent the public shell from mounting.
  let deadline: ReturnType<typeof globalThis.setTimeout> | undefined
  const deadlineReached = new Promise<void>((resolve) => {
    deadline = globalThis.setTimeout(resolve, 8_000)
  })
  try {
    await Promise.race([
      useAuthStore(pinia).refresh().catch(() => undefined),
      deadlineReached,
    ])
  } finally {
    if (deadline !== undefined) globalThis.clearTimeout(deadline)
  }
  app.mount('#app')
}

void bootstrap()
