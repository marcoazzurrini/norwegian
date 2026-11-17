// Talks to the sign-in server (worker/auth.ts).
import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient()
