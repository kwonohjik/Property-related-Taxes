/**
 * 법령 캐시 워밍업 — 앱이 인용하는 조문을 일괄 프리페치해 `.legal-cache/`에 적재.
 *
 * 법제처 DRF Open API는 주말·공휴일·야간에 접속을 차단(connect timeout → "fetch failed")한다.
 * 이 스크립트를 **평일 업무시간에** 실행해 캐시를 채워두면, 이후 법제처가 막혀도
 * stale 캐시 fallback(30일 TTL)으로 조문이 계속 표시된다.
 *
 * 실행:  npm run warmup:legal          (= tsx --env-file=.env.local scripts/warmup-legal-cache.ts)
 * 자동:  평일 cron 권장 — 파일 하단 주석 참조.
 *
 * 수집 소스:
 *   ① VERIFICATION_MANIFEST (검증 매니페스트 — 핵심 조문 ~93)
 *   ② legal-codes 상수의 §-인용 (LawArticleModal 표시 대상)
 * 두 소스 모두 getLawText(라우트와 동일 경로)로 적재 → 캐시 키 일치 보장.
 */

import { VERIFICATION_MANIFEST } from "../lib/legal-verification/verifier-manifest";
import { parseCitation } from "../lib/legal-verification/citation-parser";
import { parseLawRef } from "../lib/utils/law-url";
import { getLawText, normalizeArticleNo } from "../lib/korean-law/client-law";
import * as LEGAL_CODES from "../lib/tax-engine/legal-codes";

interface Target {
  lawName: string;
  /** 정규화된 조문번호 "제N조[의M]" — 소스 무관 동일 캐시 키 */
  articleNum: string;
  source: string;
}

/** 객체 트리에서 모든 문자열 값을 수집 */
function collectStrings(obj: unknown, out: string[]): void {
  if (typeof obj === "string") {
    out.push(obj);
  } else if (Array.isArray(obj)) {
    for (const v of obj) collectStrings(v, out);
  } else if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, out);
  }
}

function buildTargets(): Target[] {
  const map = new Map<string, Target>();
  const add = (lawName: string, rawArticleNum: string, source: string) => {
    if (!lawName || !rawArticleNum) return;
    const articleNum = normalizeArticleNo(rawArticleNum); // "89" / "제89조" → "제89조" (소스 무관 정규화)
    if (!articleNum) return;
    const key = `${lawName}|${articleNum}`;
    if (!map.has(key)) map.set(key, { lawName, articleNum, source });
  };

  // ① 검증 매니페스트
  for (const rule of VERIFICATION_MANIFEST) {
    const parsed = parseCitation(rule.citation);
    if (parsed) add(parsed.lawFullName, parsed.articleNo, "manifest");
  }

  // ② legal-codes §-인용 (LawArticleModal parseLawRef와 동일 파서)
  const strings: string[] = [];
  collectStrings(LEGAL_CODES, strings);
  for (const s of strings) {
    const ref = parseLawRef(s);
    if (ref) add(ref.lawName, ref.articleNum, "legal-codes");
  }

  return [...map.values()];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  if (!process.env.KOREAN_LAW_OC) {
    console.error("\x1b[31m✖ KOREAN_LAW_OC 미설정 — .env.local 확인 (npm run warmup:legal 은 --env-file 포함)\x1b[0m");
    process.exit(1);
  }

  const targets = buildTargets();
  console.log(`\n법령 캐시 워밍업 — 대상 ${targets.length}개 조문 (manifest + legal-codes)\n`);

  let ok = 0;
  let fail = 0;
  const failed: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const label = `${t.lawName} ${t.articleNum}`; // articleNum은 이미 "제N조" 정규형
    try {
      const article = await getLawText(t.lawName, t.articleNum);
      if (article?.fullText) {
        ok++;
        process.stdout.write(`\r\x1b[32m✓\x1b[0m ${i + 1}/${targets.length}  ${label.padEnd(40)}`);
      } else {
        fail++;
        failed.push(`${label} (조문 없음)`);
      }
    } catch (err) {
      fail++;
      failed.push(`${label} — ${err instanceof Error ? err.message : "오류"}`);
    }
    // 법제처 rate limit 배려 (분당 과다호출 방지)
    await sleep(250);
  }

  console.log(`\n\n완료: \x1b[32m성공 ${ok}\x1b[0m / \x1b[31m실패 ${fail}\x1b[0m (총 ${targets.length})`);
  if (failed.length > 0) {
    console.log("\n실패 목록 (평일 재실행 또는 인용 확인):");
    for (const f of failed.slice(0, 30)) console.log(`  - ${f}`);
    if (failed.length > 30) console.log(`  … 외 ${failed.length - 30}건`);
  }
  // 일부 실패해도 성공분은 캐시됨 — 비정상 종료 코드는 전부 실패 시에만
  process.exit(ok === 0 ? 1 : 0);
}

main();

/*
 * ── 평일 자동 워밍업 (macOS 로컬 예시) ───────────────────────────────────────
 * crontab -e 에 추가 (월~금 10:00 KST):
 *   0 10 * * 1-5  cd /절대경로/Property-related-Taxes && /usr/local/bin/npm run warmup:legal >> /tmp/legal-warmup.log 2>&1
 *
 * 또는 launchd(.plist)로 StartCalendarInterval Weekday 1~5 설정.
 * 배포 서버(파일시스템 영속)면 동일 cron, Vercel 등 ephemeral FS면 KV/DB 캐시로 전환 필요.
 */
