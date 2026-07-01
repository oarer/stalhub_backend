import jwt from '@elysiajs/jwt'
import { env } from '@/env'

export const isSecure = env.NODE_ENV === 'production'

export const refreshCookie = {
	httpOnly: true,
	secure: isSecure,
	sameSite: 'lax' as const,
	path: '/',
	maxAge: 60 * 60 * 24 * 30,
}

export const accessCookie = {
	httpOnly: false,
	secure: isSecure,
	sameSite: 'lax' as const,
	path: '/',
	maxAge: 5 * 60,
}

export const jwtPlugin = jwt({
	name: 'jwt',
	secret: env.JWT_SECRET,
})
