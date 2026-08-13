export type AuthenticatedUser = {
  id: string
  username: string
  displayName: string
  ledgerId: string
  sessionId: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}
