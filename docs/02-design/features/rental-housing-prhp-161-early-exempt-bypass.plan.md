# 장기임대 거주주택 특례(§155⑳·§161) — 전환양도 안분 우회 + 개산공제 합산표시 버그 수정 계획서

작성: 2026-07-23 · 상태: **Do 완료** (rev.3 — anchor P1~P6 RED 4건→GREEN·PDF 사례 25 원단위 전엔진 재현·RHE 85/85·전체 8,768 통과·799줄·⑭ route 매핑 기존재 실측(app/api/calc/transfer/route.ts:345~367)·acquisition-cost-review 게이트 실행) · rev.2 (자가검토 — E1 steps/warnings 정정·E2 C2 해소·V1 calcTransferGain echo 필드 실존·V2 scenario 필드 실존·§9-4 부분 해소)

## 1. 증상 (사용자 재현 — 스크린샷)

**입력**: 기타 특례 "장기임대주택 보유자 거주주택 비과세 특례" ON + **시나리오 B "임대주택을 거주주택으로 전환 후 양도"** 선택. 임대주택 1호(장기 8년·96개월·수도권 매입 3억) + 직전거주주택 양도일 2016-08-01 + 3-시점 기준시가(취득 300M·직전양도시 450M·현양도시 500M — UI 미리보기 "과세 안분 비율 75%") + 거주 38개월. 양도가 800M·양도일 2026-03-03·취득일 2009-08-12. 세대 주택수 1채(임대 제외)·1세대. 환산취득가 모드.

**관찰된 오답** (신고서):
1. 전체 양도차익 311,000,000 **전액 비과세** · 과세대상 0 · "비과세 양도소득금액 (소령 §161①)" 행 0 — **§161① 75% 과세 안분 미적용**
2. 취득가액 **489,000,000** · 필요경비 "-" — 환산취득가 480,000,000(=800M×300/500)에 **개산공제 9,000,000(=300M×3%)이 취득가액에 합산 표시** (분리 표시 정책 위반)

## 2. 원인 (코드 실측 확정)

### 버그 1 — STEP 1a 전액 비과세 조기 반환이 STEP 2.5(§161 안분)를 우회

- `lib/tax-engine/transfer-tax.ts:263~289` **STEP 1a**: `checkExemption` isExempt 시 `buildExemptEarlyResult` **즉시 반환**.
- `:424~440` **STEP 2.5**: `rentalHousingException.applyException` 시 `runRentalHousingExceptionStep` — 시나리오 B의 §161①②③ 안분(`rental-housing-exception/prhp-allocation.ts` — `ratio161_1 = (P_prior−P_acq)/(P_transfer−P_acq)` 구현 완료)이 여기 있음.
- 시나리오 B 입력이 엔진에 **정상 배관**됨(`lib/calc/transfer-tax-api.ts:675`)에도, 사용자가 UI 안내대로 "주택수 1채(임대 제외)"를 입력하면 일반 1세대1주택 요건 충족 → **STEP 1a가 먼저 발동해 STEP 2.5 미도달** → 전액 비과세.
- 시나리오 A(거주주택 양도·주택수 제외)는 전액 비과세가 법령상 정답이므로 STEP 1a 경유가 의도 동작 — **B만 우회 문제**.

### 버그 2 — 비과세 조기 반환 결과에 환산 echo 누락 → 신고서 취득가액 역산 합산

- `lib/tax-engine/transfer-tax-finalize.ts:506~508` `buildExemptEarlyResult`: `exemptGrossGain`·`usedEstimatedAcquisition`은 echo하지만 **`estimatedBase`·`estimatedDeduction` 미echo**.
- `components/calc/results/transfer/FilingFormTableHelpers.ts:548` 환산 분기 조건 `result.usedEstimatedAcquisition && result.estimatedBase !== undefined` **불충족** → `:556~568` 실가 역산 분기로 추락: `취득가액 = 양도가 − exemptGrossGain − 경비 = 800M − 311M − 0 = 489M` (환산취득가+개산공제 합산), 필요경비 표시 없음.
- 정책 위반: **개산공제 분리표시** (memory `feedback_estimated_deduction_separation`). 버그 1과 독립 — 일반 전액 비과세+환산 케이스 전반에서 재현되는 별도 버그.

## 3. 법령 근거

- 소령 §155⑳: 장기임대주택 보유자의 거주주택 비과세. §161①: **직전거주주택보유주택(PHRP — 임대→거주 전환 주택)은 직전거주주택 양도일 이후 기간분만 비과세** — 기준시가 안분 `과세 양도소득금액 = 양도소득금액 × (직전거주주택 양도당시 기준시가 − 취득당시 기준시가) ÷ (양도당시 기준시가 − 취득당시 기준시가)`. (엔진 `prhp-allocation.ts` 주석·구현 기존재 — 산식 자체는 재검증 불요, 도달성만 결함)
- §97 필요경비: 환산취득가 모드의 개산공제(소령 §163⑥)는 필요경비 항목 — 취득가액 아님 (신고서 양식 표시 구분).

## 4. 설계 결정

### D1 (버그 1). STEP 1a 게이트 — 시나리오 B 시 조기 반환 억제

```
if (exemptionResult.isExempt && !(effectiveInput.rentalHousingException?.applyException
    && effectiveInput.rentalHousingException.scenario === "B")) { ...조기 반환... }
```

- B면 일반 경로로 계속 진행 → gain 계산 → STEP 2.5가 §161 안분 결과 반환.
- **STEP 2.5 applied=false(자격 미달) 시**: 일반 경로 계속(과세 트랙). 자격 미달이면 §155⑳ 특례 부존재 → 임대주택이 주택수에 산입되어야 하므로 사용자 입력 "1채"(특례 전제) 자체가 무효 — 엔진이 재산입을 판단할 수 없으므로 **침묵 비과세 소급 금지**, 과세 경로 + 재확인 안내가 안전측. 현행 step은 applied=false 사유를 **steps에 기록**(`transfer-tax-rental-housing-step.ts:70~78` — warnings 아님, rev.2 E1 실측). 최소 구현: 이 steps 기록 유지 + **warnings에 1건 추가(신규)**: "특례 요건 미충족 — 임대주택이 주택수에 산입될 수 있어 1세대1주택 전제(주택수 입력)를 재확인하세요."
- 시나리오 A는 현행 유지 (STEP 1a 경유 전액 비과세).

### D2 (버그 2). `buildExemptEarlyResult`에 환산 echo 추가

- `calcTransferGain(p.effectiveInput)`을 이미 호출 중(:506 `exemptGrossGain`) — 반환값에서 `estimatedBase`·`estimatedDeduction`을 함께 echo (호출 1회로 통합, 환산 모드일 때만 세팅).
- `FilingFormTableHelpers.ts`는 **무변경** — 기존 `:548` 환산 분기가 자동 작동: 취득가액 480M(환산) / 필요경비 9M(개산공제).
- 상세명세서(DetailedStatement)·결과 카드의 동일 케이스 표시도 **Do에서 실측 확인** (같은 result echo 소비 시 자동 수정 기대 — 미확인).

### D3. 표시 순서 (§161 신고서 분기 기존재)

`FilingFormTableHelpers.ts:571~584`에 §161 적용 시(`rentalHousingExceptionDetail.applied`) 신고서 표기 규칙(비과세 양도차익 0·과세대상=전체·양도소득금액 단계 분리)이 이미 구현 — 버그 1 수정으로 detail이 채워지면 자동 활성. 추가 표시 작업 불요 예상(Do 실측).

## 5. 케이스 매트릭스

| # | 시나리오 | 일반 비과세 요건 | 기대 동작 | 현행 | 수정 후 |
|---|---|---|---|---|---|
| C1 | B (전환 후 양도) | 충족 (주택수 1·보유·거주) | §161① 안분 — 75% 과세 | **전액 비과세 (버그)** | STEP 2.5 안분 |
| C2 | B + 12억 초과 | 부분비과세(isExempt=false) | §161② (B2 산식) | **현행 정상 도달** (rev.2 E2 — STEP 1a 조기반환 없음 → STEP 2.5 경유) | 무변경 (회귀) |
| C3 | B + 자격 미달 (applied=false) | 충족 | 과세 경로 + steps 사유 + warnings 재확인 안내 (D1) | 전액 비과세 (버그) | 과세 + 경고 |
| C4 | A (거주주택 양도) | 충족 | 전액 비과세 (§155⑳) | 전액 비과세 ✓ | 무변경 (회귀) |
| C5 | B | 미충족 (거주 2년 미만 등) | STEP 2.5 도달 (현행도 도달) | 현행 정상 추정 (Do 확인) | 무변경 |
| C6 | 전액 비과세(특례 무관) + 환산취득가 | — | 신고서 취득가액=환산, 필요경비=개산공제 분리 | **합산 표시 (버그 2)** | 분리 표시 |
| C7 | 전액 비과세 + 실가 | — | 역산 취득가액 표시 | 정상 | 무변경 (회귀) |

## 6. Anchor (Pre-Do — RED 확인 후 Do)

파일: `__tests__/tax-engine/transfer/rental-housing-prhp-161-bypass.anchor.test.ts` (신규) + 신고서 표시는 컴포넌트 테스트.

- **P1 (C1)**: 재현 케이스 (양도 800M·환산 300/500·개산 3%·B·기준시가 300/450/500·거주 38개월·주택수 1) → `rentalHousingExceptionDetail.applied === true` + 과세 양도소득금액 = §161① 75% 안분값 (정확값은 **Do 진입 직전 probe로 실측 확정** — 장특·표 분리(`ltc-table-split`) 관여로 수기 산정 단정 금지). 현행 RED (isExempt=true 전액 비과세).
- **P2 (C4 회귀)**: 시나리오 A + 동일 요건 → 전액 비과세 유지.
- **P3 (C3)**: B + 임대 요건 미충족 → applied=false + **steps에 미적용 사유 기록**(현행 메커니즘) + 신규 warnings 1건 + `isExempt === false`(과세 경로). (rev.2 E1 — warnings→steps 정정, warnings 추가는 신규분)
- **P4 (C6, 버그 2)**: 특례 없는 전액 비과세 + 환산 모드 → `result.estimatedBase === 480_000_000` · `result.estimatedDeduction === 9_000_000` echo. 현행 RED (undefined).
- **P5 (C6 신고서)**: FilingFormTable 컴포넌트 — 취득가액 480,000,000 · 필요경비 9,000,000 분리 표시. 현행 RED (489,000,000·"-").
- **P6 (C7 회귀)**: 실가 전액 비과세 — 역산 표시 불변.

## 7. 수정 파일 (예상)

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/transfer-tax.ts` (:266) | STEP 1a 게이트 — 시나리오 B 시 조기 반환 억제 (D1) |
| `lib/tax-engine/transfer-tax-finalize.ts` (:506) | `buildExemptEarlyResult` 환산 echo (D2) |
| `lib/tax-engine/transfer-tax-rental-housing-step.ts` | applied=false 경고 문구 보강 (D1 — 필요 시) |
| anchor 2파일 + (필요 시) E2E | §6 |

**14지점**: 입력 무변경(배관 기존재 실측 — api.ts:675). result echo는 기존 optional 필드(`estimatedBase`·`estimatedDeduction`) 채움 — 타입 무변경. ⑫⑬⑭ 비해당. ⑦(신고서·명세서)은 기존 분기 자동 활성 확인.

## 8. 검증 계획

1. Pre-Do probe: 재현 케이스 P1 기대값 실측 확정 (§161① 안분·장특 상호작용 — `ltc-table-split` 경유 값)
2. anchor P1~P6 RED → 구현 → GREEN
3. 회귀: `npx vitest run __tests__/tax-engine/transfer/ __tests__/components/` + rental-housing 기존 테스트 전건
4. `acquisition-cost-review` 게이트 (취득가액·필요경비 표시 + §161 체인)
5. 브라우저(Playwright): 재현 입력 → 신고서 §161① 행·과세대상 양도차익·취득가액/필요경비 분리 확인
6. `npx tsc --noEmit` 0건

## 9. 확인 필요 (미검증 — Do 전 해소)

- ~~D1의 applied=false 정책~~ → rev.2 확정: 과세 경로 + steps 사유 + warnings 신규 1건 (D1)
- ~~C2 (12억 초과 §161②) 현행 도달성~~ → rev.2 E2 해소: 현행 정상 도달 (isExempt=false라 STEP 1a 미발동)
- 상세명세서·결과 카드가 버그 2 수정으로 자동 정상화되는지 (D2 note)
- **🟠 OPEN (게이트 C-2 제기 — 별건)**: 시나리오 **A** + RHE 요건 미충족 + 주택수 "1채" 오입력 조합 — A는 게이트 비대상이라 STEP 1a가 여전히 `runRentalHousingExceptionStep`의 eligibility 판정 **이전에** 전액 비과세 조기 반환 → B와 동일 클래스의 침묵 비과세가 이론상 가능(미적용 사유 기록조차 없음). 수정 전부터 있던 기존 동작(이번 수정으로 악화 아님). 방어 확장(게이트를 `applyException` 전체로 확대 → A도 STEP 2.5 A1 경유로 eligibility 검증 후 전액 비과세) 시 A 경로 결과 조립이 달라져 파급 큼 — 별도 계획으로 검토.
- ~~STEP 1a~2.5 사이 부작용~~ → rev.2 부분 해소: 사이 구간은 STEP 0.35(주택 no-op)·STEP 1.5(다필지 미입력 시 통과)뿐 — 잔여는 Do에서 전체 흐름 통독 1회로 마감
- P1 anchor 기대값 (§161①×장특 ltc-table-split 상호작용) — Do 진입 직전 probe 실측
