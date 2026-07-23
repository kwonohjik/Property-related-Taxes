# PHD 3-시점 환산 취득일 게이트 — 최초고시일 이후 취득 차단 계획서

> 작성: 2026-07-23 · 상태: **Do 완료** (anchor 15건 RED→GREEN · 전체 E2E 746건 0실패 · acquisition-cost-review PASS · API 실측 차단/허용 확인)
> 증상 보고: 공동주택 환산 시 취득일(의제취득일 포함)이 최초 고시일 **이후**인데도 무조건 3-시점 환산(§164⑦)이 적용됨

## 1. 증상 및 실증 (probe 실측 완료, 2026-07-23)

throwaway probe: 취득 1992-01-30 · 최초고시 1983-01-01(취득보다 **9년 이전**) · PHD 3-시점 입력 제공:

```
phdApplied: true, estimatedAcq: 101,443,032   ← §164⑦ 요건 불충족인데 3-시점 환산 적용
```

취득 당시 이미 공동주택가격(기준시가)이 고시되어 있으므로, 취득시 기준시가는 **취득일 현재 고시된 공동주택가격(직전 고시분)**을 직접 사용해 일반 환산(§176의2③)해야 한다.

## 2. 법적 근거

- **소령 §164⑦**: "양도 당시에는 개별주택가격 및 공동주택가격이 고시되어 있으나 **취득 당시에는 … 고시되지 아니한 경우**" 한정 — 3-시점 역산의 적용 요건 자체가 '취득당시 미고시'.
- 취득당시 고시 존재 시: 소법 §99①1호 라목(주택 기준시가 = 공시된 주택가격) + §176의2③(일반 환산 산식). 새 기준시가 고시 전 취득·양도는 직전 고시분 적용(재일01254-1962, 1992.7.29 — 결정공시일 기준).
- **의제취득일**: 1984-12-31 이전 취득은 1985-01-01 취득 의제(소법 부칙 — 기존 상수 `TRANSFER.DEEMED_ACQUISITION_DATE_BASIS`, legal-codes/transfer.ts:229~230). 국세청 기준시가 해설 "1985.1.1. 이후 취득한 경우에는 1985.1.1. 현재 고시되어 있는 기준시가를 적용" → **게이트 비교일 = max(취득일, 1985-01-01)**.
- 경계: 유효취득일 ≥ 최초고시일 → 고시 존재 → PHD 부적용 (고시일 당일 취득 포함 — 결정공시일 기준 적용).

## 3. 원인 분석 (file:line 실측 — 4계층 전부 게이트 부재)

| 계층 | 위치 | 현행 |
|---|---|---|
| UI 자동 ON | `CompanionAcqPurchaseBlock.tsx:104-118` | `acquisitionDate < "2005-04-29"`(개별주택 최초 공시일)만 보고 blanket 자동 체크 — 공동주택 단지별 최초고시일(1983~) 미고려 |
| API 변환 | `lib/calc/transfer-tax-api.ts:573-576` | `usePreHousingDisclosure && phdFirstDisclosureDate && price>0`만 — 날짜 비교 없음 |
| validation | `transfer-tax-validate-asset.ts:386~` | 3-시점 필수 입력 존재 검증만 |
| 엔진 | `transfer-tax-split-gain.ts:165` | `input.preHousingDisclosure && input.useEstimatedAcquisition`이면 무조건 PHD 경로. `firstDisclosureDate`는 타입에 있으나(transfer-phd.types.ts:23) 게이트로 미사용 |

## 4. 수정안 — 차단 validation + UI 경고 (자동 fallback 금지 정책 정합)

취득당시 고시분이 존재하면 필요한 입력이 **취득시 공동주택가격**(비-PHD 일반 환산 경로의 기준시가 직접 입력)으로 달라진다. PHD 입력만으로는 일반 환산을 자동 수행할 수 없으므로 **silent 전환 금지** → 입력 차단 + 안내로 사용자를 일반 환산 경로로 유도한다.

게이트 술어 (단일 소스 — `lib/calc/` 또는 엔진 헬퍼로 1곳 정의 후 재사용, dual-truth 금지):

```ts
/** §164⑦ 적용가능: 유효취득일(의제 1985-01-01 반영) < 최초고시일 */
function isPhdEligible(acquisitionDate: string, firstDisclosureDate: string): boolean {
  const effective = acquisitionDate < "1985-01-01" ? "1985-01-01" : acquisitionDate;
  return effective < firstDisclosureDate;
}
```

적용 지점:

1. **⑧ validation** (`transfer-tax-validate-asset.ts` usesPhd 블록): `!isPhdEligible(...)` → 오류
   `"취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 공동주택가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다 — 3-시점 환산을 끄고 취득시 기준시가를 직접 입력하세요."`
2. **⑤ UI 경고** (`PreHousingDisclosureSection.tsx`): 최초고시일·취득일 모두 입력 시 동일 문구 rose 카드 — 계산 전 인지 (UI 통과↔validate 차단 모순 방지).
3. **⑩ Zod refine** (`transfer-tax-schema-refines.ts` `addPropertyRefines` — 자가검토로 파일 확정): API 직접 호출 방어 — 동일 게이트 refine. 실현성 검증완료: refine data에 `acquisitionDate: string` 기접근(:18·:69), `preHousingDisclosure.firstDisclosureDate`는 `z.string().date()`(schema-sub.ts:686) — 동일 객체 내 문자열 비교 가능. (⑧과 동일 게이트 — 3중 일치)
4. **UI 자동 ON 보강** (`CompanionAcqPurchaseBlock.tsx:107`): `phdFirstDisclosureDate`가 이미 입력돼 있고 게이트 위반이면 자동 ON 억제. (고시일 미입력 상태의 기존 자동 ON은 유지 — 단지별 고시일을 사전에 알 수 없음)

엔진 게이트는 **추가하지 않음**: 상류 3중 차단으로 엔진 도달 불가. 엔진에 silent 무시 로직을 넣으면 자동 fallback 금지 정책 위반 + 취득시 기준시가 부재로 오답 산출 위험.

## 5. 케이스 매트릭스

| # | 취득일 | 최초고시일 | 기대 |
|---|---|---|---|
| M1 | 1992-01-30 | 2022-04-29 (사례 23) | PHD 허용 — **현행 유지, 회귀 0** |
| M2 | 1992-01-30 | 1983-01-01 | 차단 (validate 오류 + UI 경고) — 스크린샷 사례 |
| M3 | 1980-05-01 (의제→1985-01-01) | 1983-01-01 | 차단 — 의제취득일 1985-01-01 ≥ 1983-01-01 |
| M4 | 1980-05-01 (의제→1985-01-01) | 1993-02-01 | 허용 — 의제취득일 < 최초고시일 |
| M5 | 취득일 = 최초고시일 (동일) | 동일 | 차단 — 고시일 당일 취득은 고시 존재 |
| M6 | 최초고시일 미입력 | — | 기존 필수입력 검증 그대로 (게이트 미발동) |

## 6. 적용 범위·연관 경로 (전수 조사)

| 경로 | 게이트 대상 | 비고 |
|---|---|---|
| 일반 자산 PHD (`transfer-tax-api.ts:573`) | ✅ 본 계획 | 비교일 = assets[0].acquisitionDate |
| 이월과세 PHD (`CarryoverEstimationSection.tsx:137`) | ✅ 포함 | 비교일 = **증여자 취득일**(carryover 취득일) — Do 시 해당 폼 필드 실측 후 확정 |
| 겸용 PHD (`MixedUsePreHousingDisclosureSection`) | ⚠️ 후속 확인 | mixedUse.preHousingDisclosure 별도 전송 경로 — 동일 게이트 필요 여부 Do에서 실측, 위반 시 동일 패턴 별도 커밋 |
| 감면 조문 PHD (`ReductionPhdInput`) | 기존 게이트 有 주장(components/calc/CLAUDE.md "취득일 < 최초공시일 자동 감지") | Do에서 grep 검증만 |
| 상속 주택평가 §164⑦ (`inheritance-house-valuation`) | 범위 외 | 기준일=상속개시일, 별도 엔진 — 게이트 존재 여부 확인 후 필요 시 별건 |
| 다건(`multi-transfer-tax-api.ts`)·부담부(`gift-burdened-transfer-api.ts`) | 해당 없음 (자가검토 확인) | `preHousingDisclosure` grep 0건 — PHD 미전송 경로, 게이트 불필요 |

**자가검토(2026-07-23) 추가 확인**: ① 차단 후 대체 경로 실존 — PHD 토글 OFF 시 `CompanionAcqPurchaseBlock.tsx`(:545~)의 "취득시 기준시가" 직접 입력(`StandardPriceInput`) 브랜치가 노출됨(사용자 진행 경로 보장). ② UI 경고 구현 가능 — `PreHousingDisclosureSection`은 `asset` prop을 받으므로 `asset.acquisitionDate`·`asset.phdFirstDisclosureDate` 동시 접근 가능. ③ M3 의제취득일 법령 정합 — 국세청 기준시가 해설 "1984.12.31 이전 취득은 1985.1.1 취득 의제, 1985.1.1 현재 고시된 기준시가 적용"과 일치.

## 7. Pre-Do anchor (Do 진입 전)

파일: `__tests__/lib/calc/phd-post-disclosure-gate.anchor.test.ts` (validate 단위) + Zod refine 테스트

- A1 (M2): validate가 오류 반환 — 현행은 통과(RED) → 수정 후 오류(GREEN)
- A2 (M1 회귀): 사례 23 구성 통과 유지
- A3 (M3/M4): 의제취득일 경계 2건
- A4: Zod refine 동일 게이트 (schema 단위)

## 8. 검증 계획

1. anchor RED→GREEN
2. 회귀: `apartment-pre-disclosure*` · PHD 계열 vitest 전체 + `npm run check:pre-pr`
3. **차단 validation 추가이므로 전체 E2E 회귀 필수** (memory `feedback_blocking_validation_full_e2e_regression` ★★★) — 기존 E2E 시나리오 중 PHD 사용 스펙이 새 게이트에 걸리지 않는지 전수 실행
4. 브라우저: 스크린샷 사례 재현 → 경고 카드 + 계산 차단 확인, 사례 23 정상 계산 확인

## 8-b. acquisition-cost-review 게이트 결과 (2026-07-23, Do 중)

- **PASS — BLOCK 사유 없음.** C-1 §164⑦ 원문("공시되기 전에 취득한 주택" 한정) KoreanLaw 직접 대조 정합 · C-2 strict `<` 경계 법문 정합 · C-4 의제취득일·이월과세(§97의2①1호 원문 "취득할 당시" = 증여자 취득당시) 정합 · D-2 3중 게이트 비교일 필드 대응 전 지점 일치(payload 경로 포함) · D-3 anchor 15/15 + 회귀 GREEN.
- 겸용 게이트: §6 "후속 확인"이었으나 게이트 부재 실측 확인 → 본 Do에 포함(validate + Zod mixedUse 중첩). 겸용 상속(취득일=상속개시일)은 법적 취득일이므로 오발동 아님.
- **잔여(비블로킹)**: ① `ReductionPhdInput.tsx:74-76` 자체 게이트(의제취득일 미반영·`isPhdEligible` 미사용) — dual-truth 정리 후속 과제. ② "재일01254-1962" 예규 인용번호 자체는 KoreanLaw 커버리지 밖 — 방향성 판정에는 영향 없음(법문 독립 지지), 인용 정확성만 별도 확인 권장.

## 9. 완료 기준 (Definition of Done)

- [x] `isPhdEligible` 단일 소스 정의 (`lib/calc/phd-eligibility.ts` — UI·validate×2·Zod·자동ON 5곳 재사용)
- [x] anchor 15건 RED→GREEN (A1·A3·A5b RED 확인 후 GREEN — `phd-post-disclosure-gate.anchor.test.ts`)
- [x] 케이스 매트릭스 M1~M6 + 이월과세 A5/A5b 커버
- [x] 14지점 점검: 신규 필드 없음(게이트만) — ⑤⑧⑩ + 자동 ON 보강 + 겸용 validate/Zod 포함
- [x] 전체 E2E 회귀 746 passed/0 failed (7.7분, 2026-07-23) · `tsc` 0건 · lib/calc+transfer vitest 3,051건 통과
- [x] §6 연관 경로 실측: 이월과세(비교일=증여자 취득일, phd·apd 분기 게이트) ✅ / 겸용(게이트 부재 확인 → 본 건 포함) ✅ / 감면 ReductionPhdInput(자체 게이트 존재 — 의제취득일 미반영 dual-truth, 후속) / 다건·부담부(PHD 미전송 — 해당 없음) / 상속 주택평가(별건)
- [x] 서버 실측 (dev `/api/calc/transfer`): 위반 케이스(취득 1992·고시 1983) → 400 `fieldErrors["preHousingDisclosure.firstDisclosureDate"]` 차단 / 정상 케이스(고시 2022) → PHD 적용·totalTax 11,697,726 산출
- [ ] 브라우저 UI 경고 카드 렌더 확인 — 미수행 (서버 게이트는 실측 완료, rose 카드 시각 확인만 잔여)
