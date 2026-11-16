// Test file for ingestion
export function calculateSum(a: number, b: number): number {
  return a + b;
}

export function calculateProduct(a: number, b: number): number {
  return a * b;
}

export class Calculator {
  private history: number[] = [];

  add(a: number, b: number): number {
    const result = a + b;
    this.history.push(result);
    return result;
  }

  multiply(a: number, b: number): number {
    const result = a * b;
    this.history.push(result);
    return result;
  }

  getHistory(): number[] {
    return [...this.history];
  }
}

// This is a longer function to test segmentation
export function processData(data: any[]): { 
  total: number; 
  average: number; 
  min: number; 
  max: number 
} {
  if (data.length === 0) {
    return { total: 0, average: 0, min: 0, max: 0 };
  }

  let total = 0;
  let min = data[0];
  let max = data[0];

  for (const value of data) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const average = total / data.length;

  return {
    total,
    average,
    min,
    max
  };
}
