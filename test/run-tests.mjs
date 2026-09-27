/* =============================================================
 * run-tests.mjs — Chạy unit test trên Node (không cần trình duyệt)
 *   node test/run-tests.mjs
 * ============================================================= */
import { runTests } from './cases.js';

const results = runTests();
const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;

console.log('\n🏸 Unit Test — Engine đấu giá cầu lông\n' + '─'.repeat(60));
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'}  ${r.name}${r.ok ? '' : `\n     → ${r.error}`}`);
}
console.log('─'.repeat(60));
console.log(`Tổng: ${results.length}   ✅ Pass: ${pass}   ❌ Fail: ${fail}\n`);

process.exit(fail > 0 ? 1 : 0);