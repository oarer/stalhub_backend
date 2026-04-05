import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import { env } from '@/env'

export const apiClient = axios.create({
	baseURL: 'https://eapi.stalcraft.net',
	timeout: 10_000,
	headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
	const headers = {
		...config.headers,
		Authorization: `Bearer ${env.EXBO_TOKEN}`,
	} as InternalAxiosRequestConfig['headers']

	return {
		...config,
		headers,
	}
})

apiClient.interceptors.response.use(
	(res) => res,
	async (error: AxiosError) => {
		const config = error.config as
			| (InternalAxiosRequestConfig & { _retry?: boolean })
			| undefined

		const status = error.response?.status

		if (status === 429 && config && !config._retry) {
			config._retry = true
			return apiClient(config)
		}

		return Promise.reject(error)
	}
)
