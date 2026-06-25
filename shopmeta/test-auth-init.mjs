// Test: Does betterAuth.api.getSession work without a database?
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

const proxyLog = []
const db = new Proxy({}, {
  get(target, prop) {
    proxyLog.push(`get: ${String(prop)}`)
    return target[prop]
  }
})

console.log('Creating auth...')
const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  secret: 'test-secret',
  baseURL: 'http://localhost:3000'
})

console.log('Proxy accesses during betterAuth():', proxyLog)
console.log('Calling auth.api.getSession...')

try {
  const session = await auth.api.getSession({ headers: new Headers() })
  console.log('session:', session)
  console.log('Proxy accesses after getSession:', proxyLog)
} catch (err) {
  console.log('Error from getSession:', err.message?.slice(0, 200))
  console.log('Proxy accesses so far:', proxyLog)
}
