/**
 * API configuration with timeout support
 */

interface ApiConfig {
  timeout?: number;
  retryOptions?: {
    maxAttempts?: number;
    initialDelay?: number;
  };
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRY_ATTEMPTS = 3;

export function getApiConfig(): ApiConfig {
  return {
    timeout: parseInt(process.env.API_TIMEOUT || String(DEFAULT_TIMEOUT)),
    retryOptions: {
      maxAttempts: parseInt(process.env.API_RETRY_ATTEMPTS || String(DEFAULT_RETRY_ATTEMPTS)),
      initialDelay: parseInt(process.env.API_RETRY_DELAY || '1000'),
    },
  };
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number = DEFAULT_TIMEOUT): AbortController {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  // Clean up the timeout when the request completes
  const originalAbort = controller.abort.bind(controller);
  controller.abort = (reason?: any) => {
    clearTimeout(timeoutId);
    originalAbort(reason);
  };

  return controller;
}

/**
 * Fetch with timeout support
 */
export async function fetchWithTimeout(
  url: string, 
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;
  const controller = createTimeoutController(timeout);

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    controller.abort(); // Clean up
  }
}
