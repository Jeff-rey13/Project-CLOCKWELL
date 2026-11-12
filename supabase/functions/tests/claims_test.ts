import { assertEquals } from 'jsr:@std/assert@1';
import { claimFits } from '../_shared/app.ts';
import { receiptPathAllowed } from '../_shared/storage.ts';

const limits = { annualLimit: 500, perClaimLimit: 80, approvedThisYear: 400, pendingThisYear: 42 };

Deno.test('claim within both limits fits', () => {
  assertEquals(claimFits(limits, 58), true);
});

Deno.test('claim over the per-claim limit is refused', () => {
  assertEquals(claimFits({ ...limits, approvedThisYear: 0, pendingThisYear: 0 }, 80.5), false);
});

Deno.test('claim over the yearly limit, counting pending, is refused', () => {
  assertEquals(claimFits(limits, 58.01), false);
});

Deno.test('receipt path must be in the claim folder', () => {
  assertEquals(receiptPathAllowed('c/u/r/a.jpg', 'c', 'u', 'r'), true);
  assertEquals(receiptPathAllowed('c/u/other/a.jpg', 'c', 'u', 'r'), false);
  assertEquals(receiptPathAllowed('c/x/r/a.jpg', 'c', 'u', 'r'), false);
  assertEquals(receiptPathAllowed('c/u/r/a.svg', 'c', 'u', 'r'), false);
});
