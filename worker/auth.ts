// Sign-in with Google, through Better Auth. Only the addresses in ALLOWED_EMAILS can create an account.
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'

export interface AuthEnv {
  DB: D1Database
  /** The site's address, for example https://norwegian.marcoazzurrini.com. */
  BETTER_AUTH_URL: string
  /** Secrets, set with `wrangler secret put`. */
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /** Email addresses that may sign in, separated by commas. */
  ALLOWED_EMAILS: string
}

const DAY = 60 * 60 * 24

export const isAllowed = (env: AuthEnv, email: string | undefined | null): boolean =>
  !!email &&
  (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())

function create(env: AuthEnv) {
  return betterAuth({
    appName: 'Norsk',
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    // A device stays signed in as long as it is used at least once every six months.
    session: { expiresIn: DAY * 180, updateAge: DAY },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isAllowed(env, user.email)) throw new APIError('FORBIDDEN', { message: 'This Google account may not use this app.' })
            return { data: user }
          },
        },
      },
    },
  })
}

let auth: ReturnType<typeof create> | undefined

/** One instance per Worker instance: the settings never change while it runs. */
export const getAuth = (env: AuthEnv) => (auth ??= create(env))
