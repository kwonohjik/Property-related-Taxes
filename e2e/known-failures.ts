/**
 * CI E2E 게이트의 **알려진 사전존재 실패** 목록.
 *
 * ✅ **현재 0건** — 2026-08-03에 전건(16건) 해소됐다. 목록이 비어 있으면 제외 없이 전부 돌린다.
 *
 * ── 왜 이 목록이 있는가 ─────────────────────────────────────────────────────
 * E2E를 CI 게이트로 넣는 목적은 **신규 회귀를 잡는 것**이다. 도입 시점에 master에도
 * 16건이 실패하고 있어 그대로 넣으면 CI가 **항상 빨간불**이 된다. 상시 실패하는 게이트는
 * 게이트가 아니다 — 이 저장소는 이미 그 실패를 겪었다(lint가 상시 실패 CI에만 있어
 * 실질 관문이 없던 건, CLAUDE.md 「lint 갭 해소」).
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────────
 * 1. **줄이기만 한다.** 새 실패를 여기 추가하는 것은 회귀를 숨기는 것이다 —
 *    고치거나, 정말 불가피하면 사유와 별건 이슈를 함께 적는다.
 * 2. 항목이 사라지면(고쳐지면) **즉시 삭제**한다. 남겨두면 그 테스트가 CI에서 영영 안 돈다.
 * 3. 제목 **완전일치**가 아니라 부분일치다 — 제목을 바꾸면 제외가 풀려 CI가 빨개진다(의도된 동작).
 *
 * ── 🔍 전건 조사 결과 (memory `feedback_e2e_preexisting_failures`
 *    「사전존재는 면책이 아니라 미조사 표시」) ────────────────────────────────
 *
 * | 분류 | 건수 | 비고 |
 * |---|---|---|
 * | 🔴 **제품/데이터 결함** | **3** | E2E가 준 진짜 신호 — 아래 |
 * | 🔧 spec rot | 13 | 셀렉터·라벨·시드가 UI 변경을 못 따라감 |
 *
 * **🔴 진짜 신호 3건 (전부 수정 완료)**
 * 1. **법령 검증 커버리지 192/201** — 인용 조문 9건이 `VERIFICATION_MANIFEST` 미등록이라
 *    `verify:legal` 대상에서 조용히 빠져 있었다. 등록해 201/201 복구(PR#1013).
 *    재발 방지 게이트: `__tests__/lib/legal-verification-coverage-complete.test.ts`(PR#1014).
 * 2. **영농 사후관리 시뮬레이터 상속개시일 prefill 미동작** — 호출부는 `deathDate`를 붙이는데
 *    (`InheritanceTaxResultView.tsx:434`) 페이지는 `inheritanceStartDate`만 읽었다.
 *    가업 시뮬레이터는 `deathDate`를 쓴다 — 영농만 어긋나 있었다(`inheritance-postmgmt/page.tsx`).
 * 3. **§163⑨ 배지 노출 범위** — 일반 주택 상속에는 배지가 없고 상가·겸용에만 있다.
 *    (결함은 아니나 spec이 전제한 범위와 달라 조사로 확인한 사실)
 *
 * ⇒ **세액을 틀리게 계산하는 건은 발견되지 않았다.** §56⑤ 유상증자 반영액이 화면에서
 *   `[0, 25M, 25M]`(기대 `[12.5M, 25M, 25M]`)로 나와 세액 오류를 의심했으나,
 *   `calcCapitalIncreaseAdjustment` 단독 실측은 **정확**했다. 원인은 평가기준일 입력 시
 *   자동 산정된 **사업연도 개시일**을 spec이 덮어쓰지 않아 「0개월」이 된 것이었다.
 */
export const KNOWN_E2E_FAILURES: readonly string[] = [];

/** 정규식 메타문자 escape — 제목에 §·(·)··가 섞여 있다 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `grepInvert`용 패턴. 목록이 비면 undefined(제외 없음)를 반환한다. */
export function knownFailurePattern(): RegExp | undefined {
  if (KNOWN_E2E_FAILURES.length === 0) return undefined;
  return new RegExp(KNOWN_E2E_FAILURES.map(escapeRegExp).join("|"));
}
