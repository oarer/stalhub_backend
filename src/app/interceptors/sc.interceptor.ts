import axios, { type InternalAxiosRequestConfig } from 'axios'
import {
	exboApiDuration,
	exboApiRequestsTotal,
	recordAppError,
} from '@/app/api/metrics'
import { env } from '@/env'
import type { ApiErrorResponse } from '@/types/api.type'

type RetryAxiosRequestConfig = InternalAxiosRequestConfig & {
	_retry?: boolean
	_skipAuth?: boolean
}

export const apiClient = axios.create({
	baseURL: 'https://eapi.stalcraft.net',
	timeout: 10_000,
	headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
	const retryConfig = config as RetryAxiosRequestConfig & {
		_startTime?: number
	}
	if (!retryConfig._skipAuth) {
		config.headers.set('Authorization', `Bearer ${env.EXBO_TOKEN}`)
	}
	retryConfig._startTime = Date.now()
	return config
})

apiClient.interceptors.response.use(
	(res) => {
		const start = (
			res.config as RetryAxiosRequestConfig & { _startTime?: number }
		)._startTime
		if (start) exboApiDuration.observe((Date.now() - start) / 1000)
		exboApiRequestsTotal.inc({ status: String(res.status) })
		return res
	},
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

		exboApiRequestsTotal.inc({ status: String(status) })
		recordAppError('exbo_api')

		return Promise.reject(normalizedError)
	}
)
