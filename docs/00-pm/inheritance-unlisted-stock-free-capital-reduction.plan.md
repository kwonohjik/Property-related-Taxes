# 비상장주식 보충적평가 — 무상감자(free capital reduction) 입력 지원

> Plan 문서. 작성 2026-06-26. 브랜치 `feat/fy-end-shares-outstanding`.
> 교재 「3. 각 사업연도말 현재 발행주식 총수의 계산」(평가실무, 이미지 1~10) 대조 결과 도출된 단일 갭 보완.

## 0. 배경·문제정의

비상장주식 V2 보충적평가의 자본금 변동 입력(`UnlistedCapitalChange`)은 **3종만** 지원한다.

| 현행 changeType | 라벨 | 환산주식수(§17의3⑤) | 순손익액 조정(§56⑤) |
|---|---|---|---|
| `paid_in` | 유상증자 | +주식수 | +1주당납입금액×주식수×10% (월할) |
| `free_issue` | 무상증자 | +주식수 | 없음 |
| `capital_reduction` | 유상감자 | −주식수 | −1주당지급금액×주식수×10% (월할) |

**누락**: **무상감자(free capital reduction)**. 교재 §17의3⑤ 2호 감자 환산식은 **유상·무상 감자 모두** 적용 대상이며, 무상감자는 순손익액 조정만 없을 뿐 환산주식수에는 동일하게 반영된다.

- 교재 직접 사례: **계산사례 ③-사례2(무상감자)**(이미지 8), **계산사례 ⑤(무상감자+무상증자 2단계 환산)**(이미지 9~10).
- 현행 차단 지점: UI `CapitalChangeTable`이 `capital_reduction`을 "유상감자"로만 라벨하고 1주당 지급금액을 required로 강제 → validate(`inheritance-validate-unlisted.ts:121`)·Zod(`unlisted-stock-valuation-v2.schema.ts`)가 `pricePerShare<=0`을 차단 → **무상감자 입력 경로가 존재하지 않음**.

### 가정·범위

- **가정**: 무상감자는 환산주식수에는 영향(−주식수), 순손익액 조정(§56⑤)은 **미적용**(무상이므로 1주당 지급금액 없음). 교재 (2)④ "유상증자·감자금액 × 10%" 산식 대상은 유상에 한정.
- **범위 외(보고만, 본 계획 미포함)**:
  - (1)② 상환·전환우선주 — 명문 규정 부재(서사-3346 vs 서사-1894 해석 충돌). 사용자가 `totalShares`에 합산 입력으로 처리.
  - (2)③ 2011.7.24 이전 개정연혁 게이트 — 현행 평가기준일은 항상 2011.7.25 이후 → 유상·무상 모두 환산이 정답이며 현재 구현이 이를 적용.
  - (2)2)④⑤ 유상증자 희석 심판사례(조심·국심) — 법령 아닌 심판례, 명문 산식 부재.

## 1. 핵심 설계 결정

**enum 4번째 값 `free_reduction` 추가** (`free_issue`와 대칭 명명).

- 환산식: `free_reduction`은 감자이므로 `signedDelta`에서 **음수(−sharesIssued)** 로 취급. **← 유일한 엔진 correctness 변경점.**
- 순손익액 조정: `calcCapitalIncreaseAdjustment`는 `paid_in`/`capital_reduction`만 처리하므로 `free_reduction`은 자연 제외(추가 변경 불요). 단 의도 명시 주석 추가.
- UI/validate/Zod: `free_reduction`은 무상증자와 동일하게 1주당 금액 검증 제외, 주식수·변동일만 필수.

> 대안(기각): `capital_reduction`의 `pricePerShare`를 optional로 풀어 유·무상을 한 enum으로 통합 → 라벨·tone·결과 표기가 모호해지고 "유상감자인데 가격 미입력"과 "무상감자"를 구분 불가. enum 분리가 명확.

## 2. 케이스 매트릭스

| # | 케이스 | 입력 | 환산주식수 기대 | 순손익조정 |
|---|---|---|---|---|
| C-1 | 무상감자 단건(사업연도 중) | 2020.5.1 −1,000 / total 후속 추적 | §17의3⑤ 2호 비율 | 0 |
| C-2 | 무상감자 단건(평가기준일 사업연도 중) | 평가연도 내 감자 | 직전 3개년 모두 환산 | 0 |
| C-3 | 교재 ③-사례2 (무상감자 2건) | 2020.5.1 −1,000 · 2022.3.1 −2,000, total 3,000 | **[3000, 3000, 3000]** | 0 |
| C-4 | 교재 ⑤ (무상감자+무상증자 2단계) | 2005 −200,000 · 2006 +500,000, total 1,300,000 | **[1.3M, 1.3M, 1.3M]** | 0 |
| C-5 | 유상감자 회귀(기존) | pricePerShare>0 | 기존과 bit-identical | 기존 ±10% 월할 유지 |
| C-6 | 무상감자 + 유상증자 혼합 | 순차 running 잔고 | telescoping 수렴 | 유상분만 조정 |

### 엔진 트레이스 검증(작성 시 실측 완료)

- **C-3**: total=3,000, FY말=[2021.12.31, 2020.12.31, 2019.12.31], 변동=[2020.5.1 −1,000, 2022.3.1 −2,000] → `calcConvertedShares` 결과 **[3000, 3000, 3000]**. 교재 일치.
- **C-4**: total=1,300,000, FY말=[2006.12.31, 2005.12.31, 2004.12.31], 변동=[2005.6.1 −200,000, 2006.6.1 +500,000] → **[1,300,000, 1,300,000, 1,300,000]**. 교재 2단계 환산(2004년도 1차 감자환산→2차 증자환산)을 running-balance가 자동 수렴. 교재 일치.

> 두 트레이스 모두 `signedDelta`가 `free_reduction`을 음수로 처리한다는 전제에서 성립. 현행 코드는 `free_reduction`이 enum에 없어 트레이스 불가 → 본 변경 필수.

## 3. 동기화 지점 (전수 점검)

| # | 지점 | 파일:line | 변경 |
|---|---|---|---|
| ① | 타입 enum | `lib/tax-engine/types/unlisted-stock-valuation.types.ts:39` | `changeType`에 `"free_reduction"` 추가 |
| ② | 엔진 환산 부호 ★ | `lib/tax-engine/property-valuation/converted-shares.ts:38` `signedDelta` | `changeType === "capital_reduction" \|\| changeType === "free_reduction" ? -sharesIssued : +sharesIssued` |
| ③ | 엔진 순손익조정 | `lib/tax-engine/property-valuation/capital-increase-adjustment.ts:54` | 변경 불요(자연 제외). 주석에 `free_reduction` 미적용 명시 |
| ④ | Zod enum | `lib/validators/unlisted-stock-valuation-v2.schema.ts:40` | enum에 `"free_reduction"` 추가 |
| ⑤ | Zod superRefine | `unlisted-stock-valuation-v2.schema.ts:~276` | `capital_reduction`만 pricePerShare 필수 유지(무상감자 제외 — 이미 분기됨, 확인) |
| ⑥ | validate | `lib/calc/inheritance-validate-unlisted.ts:97,121` | typeLabel에 무상감자 추가, line121 가격검증은 `capital_reduction`에만 적용(무상감자 제외) |
| ⑦ | lookup 캐스트 | `lib/calc/unlisted-stock-valuation-lookup.ts:229` | 캐스트 유니온에 `"free_reduction"` 추가 |
| ⑧ | UI select·라벨·tone | `components/calc/inheritance/unlisted-stock-v2/CapitalChangeTable.tsx:34,40,112,160,179` | option 추가, `CHANGE_TYPE_LABEL`/`CHANGE_TYPE_TONE` 추가, 가격필드 조건(`paid_in\|capital_reduction`만), 무상감자 안내문구 |
| ⑨ | 결과/별지 표기 | (없음) | `BesshiForm4Buppyo3PrintView`는 changeType 라벨 미참조 — 확인 완료. 변경 불요 |

- **tone**: 무상감자 = 감자(rose 계열) + 무상(emerald 계열) 절충 → `bg-rose-50 text-rose-700 border-rose-200`(감자=rose 유지, 무상은 안내문구로 구분) 또는 신규 tone. 설계 시 확정.
- **fallback 3중 패턴**: 본 변경은 신규 enum 값 추가일 뿐 fallback 도출 필드 없음 → mirror-pattern 해당 없음.

## 4. anchor 테스트

`__tests__/tax-engine/property-valuation/converted-shares.test.ts`에 추가:

- `[SC-11] 무상감자 단건` — C-1
- `[SC-12] 교재 ③-사례2 무상감자 2건 → [3000,3000,3000]` — C-3 (교재 상수 고정)
- `[SC-13] 교재 ⑤ 무상감자+무상증자 2단계 → [1.3M×3]` — C-4 (교재 상수 고정)
- `[REG] 유상감자 회귀` — SC-4 결과 불변 확인(bit-identical)

`__tests__/tax-engine/property-valuation/case-1b-bonus-issue.test.ts` 패턴 참조하여 순손익조정=0 확인 anchor 1건.

## 5. 실행 순서 (Do — 단일 응답 완주)

1. ① 타입 enum → `npx tsc --noEmit`로 미동기 지점 자동 발각(②④⑥⑦⑧이 TS 에러로 노출)
2. ② signedDelta(★) + ③ 주석
3. ④⑤ Zod → ⑥ validate → ⑦ lookup
4. ⑧ UI(select·label·tone·가격조건·안내)
5. anchor 테스트 4건 작성 → `npx vitest run __tests__/tax-engine/property-valuation/converted-shares.test.ts`
6. 회귀: `npx vitest run __tests__/tax-engine/property-valuation/` + `lib/calc` validate 테스트
7. E2E(선택): 비상장 V2 무상감자 입력→계산 플로우 1 spec
8. `npx tsc --noEmit` 0건 → `npm run lint`(변경 파일)

### 성공 기준 (verify)

- [ ] C-3 anchor = `[3000,3000,3000]` (교재 ③-사례2)
- [ ] C-4 anchor = `[1300000,1300000,1300000]` (교재 ⑤)
- [ ] 유상감자(SC-4) 결과 불변(회귀 0)
- [ ] 무상감자 입력 시 1주당 금액 미요구(UI·validate·Zod 일치)
- [ ] `tsc --noEmit` 0건 / property-valuation 테스트 전체 통과
- [ ] 브라우저 또는 E2E로 무상감자 입력→환산주식수 결과 확인(미수행 시 명시)

## 6. 리스크

- **유일 correctness 리스크**: `signedDelta` 미수정 시 무상감자가 +주식수로 처리되어 환산·역산 전부 오류. ② 최우선.
- **회귀 리스크**: 낮음. 신규 enum 값 추가는 기존 3종 경로 불변. `tsc`가 switch/매핑 누락 자동 발각.
- **법령 정확성**: 무상감자 순손익조정 미적용은 §56⑤(유상 한정)에 정합. 환산식은 §17의3⑤ 2호(유·무상 공통).
