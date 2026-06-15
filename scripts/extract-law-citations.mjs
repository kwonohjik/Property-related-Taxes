/**
 * extract-law-citations.mjs — 상속·증여 UI 법조문 인용 인벤토리 추출 (Phase 0)
 *
 * 노출 인용(label·hint·title·description·placeholder·legalBasis·JSX텍스트)의
 * §N / 제N조 패턴을 추출, 주석·식별자 제외. legalBasis= 는 링크됨으로 집계.
 *
 *   node scripts/extract-law-citations.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";

const CWD = process.cwd();
// 세목 인자화: node scripts/extract-law-citations.mjs <tax>  (기본 inheritance-gift)
const TAX = process.argv[2] || "inheritance-gift";
const CONFIG = {
  "inheritance-gift": {
    ROOTS: ["components/calc/inheritance", "components/calc/gift"],
    RESULTS_DIRS: ["components/calc/results/inheritance", "components/calc/results/allocation-breakdown"],
    RESULTS_FILES: [
      "InheritanceTaxResultView.tsx", "GiftTaxResultView.tsx",
      "InheritanceFilingFormTable.tsx", "GiftTaxFilingFormTable.tsx", "GiftTaxValuationFormTable.tsx",
      "HeirAllocationSummaryTable.tsx", "BundledAllocationCard.tsx", "DebtAllocationResultCard.tsx",
    ].map((f) => `components/calc/results/${f}`),
  },
  "stock-transfer": {
    ROOTS: ["components/calc/stock-transfer"],
    RESULTS_DIRS: [],
    RESULTS_FILES: [
      "StockTransferTaxResultView.tsx", "StockTransferTaxResultViewHelpers.tsx",
      "PostListingDetailCard.tsx", "StockTransferPenaltySection.tsx",
      "ListedStockBesshiResultSection.tsx", "UnlistedStockBesshiResultSection.tsx",
      "ForeignStockResultCard.tsx", "UnlistedStockSimpleValuationSection.tsx",
    ].map((f) => `components/calc/results/${f}`)
      .concat(["components/calc/stock-transfer/StockFilingFormTableHelpers.ts"]),
  },
};
const { ROOTS, RESULTS_DIRS, RESULTS_FILES } = CONFIG[TAX] ?? CONFIG["inheritance-gift"];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (e.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const files = [];
for (const r of ROOTS) walk(join(CWD, r), files);
for (const r of RESULTS_DIRS) walk(join(CWD, r), files);
for (const r of RESULTS_FILES) { const p = join(CWD, r); if (existsSync(p)) files.push(p); }

const CITE = /(§\s*\d+(?:의\s*\d+)?|제\s*\d+\s*조(?:의\s*\d+)?)/;
const EXPOSE = /\b(label|hint|title|description|placeholder|legalBasis)\s*=|>\s*[^<>{}]*(?:§|제\s*\d+\s*조)/;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

let totalExposed = 0, totalLinked = 0;
const perFile = [];
const unlinked = [];

for (const f of files) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  const hasModalImport = /LawArticleModal|TaxHelp/.test(src);
  let exposed = 0, linked = 0;
  src.split("\n").forEach((ln, i) => {
    if (COMMENT.test(ln) || !CITE.test(ln) || !EXPOSE.test(ln)) return;
    exposed++;
    if (/legalBasis\s*=/.test(ln)) linked++;
    else unlinked.push(`${relative(CWD, f)}:${i + 1}: ${ln.trim().slice(0, 88)}`);
  });
  if (exposed > 0) {
    perFile.push({ f: relative(CWD, f), exposed, linked, un: exposed - linked, imp: hasModalImport });
    totalExposed += exposed; totalLinked += linked;
  }
}

perFile.sort((a, b) => b.un - a.un);
console.log("=== 파일별 (미링크 내림차순, 상위 25) ===");
for (const p of perFile.slice(0, 25))
  console.log(`미링크 ${String(p.un).padStart(2)} / 노출 ${String(p.exposed).padStart(2)} (링크 ${p.linked}) ${p.imp ? "[import]" : "       "}  ${p.f}`);
console.log(`\n총: 노출 ${totalExposed} · 링크 ${totalLinked} · 미링크 ${totalExposed - totalLinked} · 파일 ${perFile.length}`);
console.log(`\n=== 미링크 인용 상위 30 ===`);
unlinked.slice(0, 30).forEach((u) => console.log(u));
