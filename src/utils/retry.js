async function executeWithRetry(operation, options = {}) {
	const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 2;
	const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => false;
	const onRetry = typeof options.onRetry === 'function' ? options.onRetry : () => {};

	let attempt = 0;
	let lastError;

	while (attempt <= maxRetries) {
		try {
			return await operation(attempt + 1);
		} catch (error) {
			lastError = error;

			const canRetry = attempt < maxRetries && shouldRetry(error);
			if (!canRetry) {
				break;
			}

			attempt += 1;
			await onRetry({ attempt, error });
		}
	}

	throw lastError;
}

module.exports = {
	executeWithRetry,
};
