# 수정 계획서 — 취득세 계산과정 산식 값 인라인 (AC1~AC6)

> 작성일 2026-07-27 · 세목: 취득세(결과뷰 "계산 과정 상세 보기") · 유형: 표시 개선
> 선행 감사: 타 세목 상세명세서 산식 전수 조사(2026-07-27) — 취득세만 라벨-only/부분값 잔존, 타 세목은 값 인라인 완비 또는 별지서식 재현(예외)
> 표준: memory `feedback_result_view_korean_formula`·`feedback_detailed_statement_formula_sync` / 양도세 A군(PR #819) 동종 패턴

## 배경

취득세 결과뷰 `AcquisitionTaxResultView.tsx:671`은 `result.steps[].formula`(산식)를 amount(값) 옆에 표시한다. 엔진(`lib/tax-engine/acquisition-tax.ts` STEP "계산 과정 정리", 498~566)이 생성하는 formula 중 다수가 **피연산자 값을 인라인하지 않아** 산식만으로 계산 근거를 읽기 어렵다. 양도세 A군(총결정세액·감면 등)에서 해소한 것과 동일 유형.

**amount 칸에 결과값은 있으나 formula 칸이 피연산자·결과를 문자만 서술** → 개선 대상.

## Pre-Do 실측 (엔진 스코프 값 존재 확인 — 추정 아님)

| 필요 값 | 변수 | 위치(acquisition-tax.ts) |
|---|---|---|
| 과세표준 | `taxBase` | 504 (amount) |
| 취득세 본세 | `acquisitionTax` | 518 (amount) |
| 농어촌특별세 | `ruralSpecialTax` | 532 (amount) |
| 지방교육세 | `additional.localEducationTax` | 541 (amount) |
| 합계(감면 전) | `totalTax` | 548 (amount) |
| 감면세액 | `reductionAmount` / `bestReduction.amount·label` | 488·483 |
| 감면 후 합계 | `totalTaxAfterReduction` | 490 |

- 포맷 관례: 엔진 formula 내 숫자는 `.toLocaleString()` (기존 555행 선례).
- `buildLocalEducationTaxFormula`(acquisition-tax-rate.ts:407)는 **취득세 엔진 1곳에서만 사용**(grep 확인) → 호출부에서 결과값 append 안전(빌더 시그니처 불변 = surgical).

## 수정 항목 (AC1~AC6)

| # | 행 | 항목 | 현재 formula | 개선 formula(값 인라인) |
|---|---|---|---|---|
| **AC1** | 547 | 합계 납부세액(감면 전) | `취득세 + 농특세 + 지방교육세` | `취득세 {acquisitionTax} + 농특세 {ruralSpecialTax} + 지방교육세 {localEducationTax} = {totalTax}` |
| **AC2** | 563 | 감면 후 최종 납부세액 | `합계 − {label}` | `합계 {totalTax} − {label} {reductionAmount} = {totalTaxAfterReduction}` |
| **AC3** | 531 | 농어촌특별세 | `(표준세율 2% + 중과분) × 과세표준 × 10% (§…)` | `(표준세율 2% + 중과분) × 과세표준 {taxBase} × 10% = {ruralSpecialTax} (§…)` |
| **AC4** | 540 | 지방교육세 | `buildLocalEducationTaxFormula(...)`(구조식) | `{buildLocalEducationTaxFormula(...)} = {localEducationTax}` (호출부 결과값 append) |
| **AC5** | 509~517 | 취득세 본세 | `과세표준 × {세율}%`(5분기, 과세표준값·결과 없음) | `과세표준 {taxBase} × {세율}% = {acquisitionTax}` |
| **AC6** | 553 | 감면세액 | `취득세 본세 × 50% (§…)` / `전액 감면 (한도 …)` | `취득세 본세 {acquisitionTax} × 50% = {reductionAmount} (§…)` / `취득세 본세 전액 감면 (한도 …) = {reductionAmount}` |

- **비대상**: 501 과세표준 = `신고가액/시가표준액 (…)` — 산정원(源) 표기·연산 없음(양도세 조사에서 base-source 제외와 동일).

## 구현 방침 (Surgical)

- **AC1·AC2·AC3·AC6**: 해당 formula 문자열에 스코프 변수 `.toLocaleString()` 인라인 + `= 결과값` append. 조문 근거(§) 표기·구조 서술은 **보존**.
- **AC4**: 호출부(540) `formula: \`${buildLocalEducationTaxFormula(...)} = ${additional.localEducationTax.toLocaleString()}\`` — 빌더 내부 미변경(공유 시그니처 유지, 분기별 구조식 그대로 + 결과값만 append). ⚠ 빌더 반환 분기 일부는 과세표준 기반이 아님("본문 지방교육세액 × 300%" 등)이라 과세표준값 인라인은 부적절 → **결과값 append가 정확한 개선**.
- **AC5**: 5분기 ternary를 **세율 표현부만 산출**하도록 정리(선두 "과세표준 × " 제거) → `formula: \`과세표준 ${taxBase.toLocaleString()} × ${rateExpr} = ${acquisitionTax.toLocaleString()}\`` 단일 조립. 각 분기 세율 로직·조문 근거(legalBasis 별도 필드) 불변.
- 금액은 원(정수) — `.toLocaleString()`만 사용(신규 반올림/절사 도입 금지).
- AC6 amount는 `-reductionAmount`(음수) 유지 — formula는 감면 **크기**(reductionAmount 양수) 표기.

## 영향 파일

| 파일 | 대상 |
|---|---|
| `lib/tax-engine/acquisition-tax.ts` | AC1:547·AC2:563·AC3:531·AC4:540·AC5:509~517·AC6:553 |

- `acquisition-tax-rate.ts`(빌더)·UI(`AcquisitionTaxResultView.tsx`)·타입·API·validate·14지점 **변경 없음**(formula 문자열 값만 개선 — input/result 스키마 불변).

## 검증 (성공 기준)

1. **anchor 신규**: `__tests__/tax-engine/acquisition-step-formula-inline.anchor.test.ts`
   - 시나리오 A(주택 유상취득·중과 off): `result.steps.find(s => s.label==="합계 납부세액 (감면 전)").formula`에 `acquisitionTax`·`totalTax` 숫자 포함 / 본세 formula에 `taxBase`+`acquisitionTax` 숫자 포함 / 농특세·지방교육세 formula에 결과값 숫자 포함.
   - 시나리오 B(감면 발동 — 생애최초 `isSmallHouseFirstHome` 또는 자경농지): 감면세액·감면 후 합계 formula에 `reductionAmount`·`totalTaxAfterReduction` 숫자 포함. (감면 발동 입력은 Do에서 기존 테스트 픽스처 재사용 or 실측 도출 — anchor 우선)
   - 헬퍼: `expect(/\d/.test(formula)).toBe(true)` + 대표 실측 금액 문자열 `toContain`.
2. 기존 취득세 테스트(`acquisition-tax*.test.ts`) 회귀 0 — amount·appliedRate·조문 근거 불변.
3. `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/acquisition-tax.ts` 관련 GREEN · eslint 0.
4. (선택) 브라우저 수동: 취득세 계산 → "계산 과정 상세 보기" 펼침 → 각 행 산식에 실값 노출 확인.

## 범위·비고

- 순수 표시 개선 — 세액 산출·조문 근거·input/result 스키마 불변(회귀 위험 낮음).
- 타 세목(상속·증여 별지서식)은 관인서식 항목번호 참조가 원본 충실 재현이라 **개선 제외**(memory `feedback_pdf_table_row_one_to_one_mapping`). 재산·종부·주식은 이미 값 인라인 완비.
