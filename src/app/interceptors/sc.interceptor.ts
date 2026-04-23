import axios, { type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/env'
import type { ApiErrorResponse } from '@/types/api.type'

type RetryAxiosRequestConfig = InternalAxiosRequestConfig & {
	_retry?: boolean
}

export const apiClient = axios.create({
	baseURL: 'https://eapi.stalcraft.net',
	timeout: 10_000,
	headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
	config.headers.set('Authorization', `Bearer ${env.EXBO_TOKEN}`)
	return config
})

apiClient.interceptors.response.use(
	(res) => res,
	async (error: unknown) => {
		if (!axios.isAxiosError<ApiErrorResponse>(error)) {
			return Promise.reject(error)
		}

		const config = error.config as RetryAxiosRequestConfig | undefined
		const status = error.response?.status ?? 500

		if (status === 429 && config && !config._retry) {
			config._retry = true
			return apiClient(config)
		}

		const data = error.response?.data

		const normalizedError = {
			status,
			message: data?.title ?? error.message ?? 'Unknown error',
			details: data?.details,
		}

		return Promise.reject(normalizedError)
	}
)