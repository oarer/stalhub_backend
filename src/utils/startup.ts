export const deferStartup = (task: () => void): void => {
	setTimeout(task, 0)
}
