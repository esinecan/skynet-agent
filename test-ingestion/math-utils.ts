// Math utility functions
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

export function isPrime(n: number): boolean {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  
  let i = 5;
  while (i * i <= n) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
    i += 6;
  }
  return true;
}