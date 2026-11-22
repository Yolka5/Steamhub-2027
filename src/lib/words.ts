/** "1 piece", "3 pieces". The plural defaults to the word plus "s". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
