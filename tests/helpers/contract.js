import { expect } from '@jest/globals';

export function assertMatchesContract(contract, res) {
  const documented = contract.responses[String(res.status)];
  expect(Object.keys(contract.responses)).toContain(String(res.status));
  if (documented.schema) {
    const parsed = documented.schema.safeParse(res.body);
    expect(parsed.error?.issues).toBeUndefined();
    expect(parsed.data).toEqual(res.body);
  } else {
    expect(res.text).toBe('');
  }
}
