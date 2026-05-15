# 수정계획서 — 조합원 입주권 양도(관리처분 인가 후) LTHD 분할 회귀 정정

> 작성일: 2026-05-15 · 작성자: Claude (transfer-tax 엔진+UI 공동 작업)
> 참조: 사례 36 (case-36-right-to-move-in-with-settlement-pay.md), 사례 47, 사례 48
> 법령 근거: 소득세법 §95② 단서 · 시행령 §166①1호 · §166⑤1호 · §94①2호

---

## 1. 문제 정의

### 1.1 사용자 보고 화면 (재현 입력)

| 항목 | 값 |
|---|---|
| propertyType | `redevelopment_apt` |
| 양도 대상 (`redevSubject`) | **`right`** (입주중 양도 — 관리처분 인가 후 조합원 입주권 양도) |
| 취득일 | 2002-04-09 (원조합원, 매매) |
| 관리처분 인가일 (`redevApprovalDate`) | 2018-10-23 |
| 양도일 | 2023-03-02 (보유기간 합계 20년 10월) |
| 취득가액 | 100,000,000 |
| 권리가액 (`redevRightsValue`) | 300,000,000 |
| 청산금 방향 / 금액 | 청산금 납부 / 90,000,000 |
| 양도가액 | 520,000,000 |
| 인가전·인가후 필요경비 | 0 (미입력) |

### 1.2 화면에 표시된 결과 (오류)

| 항목 | 표시값 | 평가 |
|---|---|---|
| 전체 양도차익 | 420,000,000 (= 520M − 100M) | OK (합계) |
| **장기보유특별공제** | **126,000,000 (= 30% × 420M)** | **❌ 인가전·인가후 전체에 표1 적용** |
| 양도소득금액 | 294,000,000 | ❌ 후행 영향 |
| 산출세액 | 90,830,000 | ❌ 후행 영향 |
| 보유기간 | 20년 10월 (전체) | ⚠ 단일 분기만 표시 — 분리 미노출 |

### 1.3 법령상 정답 (소령 §166①1호 + §95② 단서)

| 분기 | 양도차익 | 보유기간 (LTHD 기산) | LTHD 적용율 (1세대1주택 미충족 가정) |
|---|---:|---|---:|
| 인가전 (취득~인가일) | **200,000,000** (= 권리가액 300M − 취득가 100M − 인가전 필요경비 0) | 2002-04-09 ~ 2018-10-23 = **16년 6월** (표1) | **30%** |
| 인가후 + 청산금 (인가일~양도일) | **220,000,000** (= 양도가액 520M − (권리가액 300M + 청산금 90M) − 인가후 필요경비 0 + 청산금 분 = §166①1호 단순 합산) | — | **0% (§95② 단서)** |
| **합계** | **420,000,000** | — | **LTHD 60,000,000** |

→ 정답 LTHD = `60,000,000`, 현재 표시 LTHD = `126,000,000`. **66,000,000 과대공제**.

---

## 2. 원인 분석 (예상 위치 우선순위)

### 2.1 엔진 코드 현황 (이미 분할 구현됨)

- `lib/tax-engine/redevelopment-lthd.ts:136-209` — `subject === "right"` 분기에서 `computeRightLthd` 호출.
  - `preApproval`: 취득일~인가일 기준 표1 30% 산정 (1세대1주택 미충족 시).
  - `postApprovalExistingHouse`, `settlement`: `zeroBranch()` 처리 (LTHD 0).
- `lib/tax-engine/redevelopment-split.ts:355-387` — `computeRightPay` 분기에서 양도차익을 인가전(200M)과 인가후(220M = postApprovalGain → settlement 분기에 합산)으로 분리. `postApprovalExistingHouse.gain = 0`로 마스킹, `settlement.gain` 에 인가후 + 청산금 합산.
- `lib/tax-engine/transfer-tax-redevelopment.ts:300-305` — `totalLthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd`. 정상 합산이면 `60M + 0 + 0 = 60M` 이 되어야 함.

→ 엔진 분할 자체는 정상. **결과값 126M은 엔진을 거치지 않은 fallback 경로** 또는 **redevSubject가 "apt"로 보정되는 변환 경로**로 추정.

### 2.2 의심 경로 (우선 검증 대상 — Do 진입 전 anchor 1건 작성으로 사전 검증 필수)

**의심 경로 A — `redevSubject` 미전달 (가장 의심)** ★

- 위치: `lib/calc/transfer-tax-api-helpers.ts:685`
  - `subject: (asset.redevSubject || "apt")` — UI에서 `redevSubject` 가 빈 문자열로 도달하면 `"apt"`로 fallback.
- 위치: `components/calc/transfer/RedevelopmentBlock.tsx` (§① 라디오)
  - 사례 36 도입 시 옵션은 추가되었으나 **초기값(initial)** 이 `"apt"` 일 가능성. 사용자가 "입주중 양도" 라디오를 클릭해도 onChange가 store에 반영되지 않으면 빈 상태 유지.
- 위치: `lib/stores/calc-wizard-store.ts` 의 `initial.redevSubject` / `normalize`
- 검증 방법:
  1. 브라우저 콘솔에서 `useCalcWizardStore.getState().assets[0].redevSubject` 확인 (예상 `"right"`).
  2. Network 탭 `/api/calc/transfer` request body의 `assets[0].redevelopment.subject` 확인.
  3. 둘 다 `"right"` 라면 경로 A 배제. `"apt"` 라면 UI ① 매핑 회귀.

**의심 경로 B — `redevSubject="right"` 인데 후처리 단계에서 분할 결과가 손실**

- 위치: `lib/tax-engine/transfer-tax-redevelopment.ts:270-326` 의 `scaleBranch` (12억 초과 안분 등 후처리).
  - 사례 45 (12억 안분)·사례 47 (settlement 비과세) 도입 후 `preApproval.lthd` 가 scaleBranch에서 **post-approval 가중치까지 적용** 받아 30% × 전체로 부풀려질 가능성.
- 위치: `lib/calc/redevelopment-filing-form.ts` (있다면) 또는 `FilingFormTable` 의 `aggregate` 산식.
  - 신고서 양식 행은 엔진 `totalLthd` 가 아닌 `gain × LTHD율` 을 재계산할 수 있음 — 표 layer 단독 회귀 가능.

**의심 경로 C — `subject="right"` 인데 `preApprovalGain` 자체가 잘못 산정**

- 위치: `lib/tax-engine/redevelopment.ts` 또는 `redevelopment-valuation.ts` — `preApprovalGain` 산식.
- 의심: `preApprovalGain = transferPrice − oldAcquisitionPrice` (전체 차익)로 잘못 잡혀 `computeRightPay` 입력 `preApprovalGain` 자체가 420M.
- 검증: `npx vitest run -t "right-transfer pre/post split"` 또는 신규 anchor.

### 2.3 결과 화면 분리 미노출 (보유기간 20년 10월 단일 표기)

- 위치: `components/calc/transfer/FilingFormTable.tsx` (또는 `RedevelopmentDetailCard`).
- 현재 화면이 단일 행으로 합산 표시하므로 사용자가 분기별 검증 불가.
- 사례 47의 `RedevelopmentDetailCard` 옵션 B 4행 분해 패턴 차용 필요.

---

## 3. 수정 범위 (PDCA Do 작업 항목)

### 3.1 Phase 1 — Anchor 우선 작성 (Pre-Do 검증, memory `pre_anchor_verification` 정책)

신규 anchor 파일: `__tests__/tax-engine/transfer/case-redev-right-transfer-pay-lthd-split.test.ts`

| anchor ID | 입력 | 기대값 | 의도 |
|---|---|---|---|
| R-PAY-1 | 본 사례 그대로 (1세대1주택 미충족) | `preApproval.gain = 200_000_000` | preApprovalGain 산정 검증 |
| R-PAY-2 | 동일 | `preApproval.lthd = 60_000_000` (= 200M × 30%) | 표1 30% × preApproval만 |
| R-PAY-3 | 동일 | `postApprovalExistingHouse.lthd = 0` | §95② 단서 |
| R-PAY-4 | 동일 | `settlement.lthd = 0` | §95② 단서 |
| R-PAY-5 | 동일 | `totalLthd = 60_000_000` | 합산 |
| R-PAY-6 | 동일 | `taxableIncome = 360_000_000` (= 420M − 60M) | 양도소득금액 |
| R-PAY-7 | 동일 | `calculatedTax = §55 누진 계산값` (2023년 기본세율 적용; 기본공제 2,500,000 차감 후) | 산출세액 anchor — 양도연도 세율표(memory `transfer_year_tax_rate`) |
| R-PAY-8 | 동일 + `redevSubject = "apt"` 강제 | LTHD = 126_000_000 (현재 화면 결과 재현) | **회귀 차단** — fallback 경로 검증용 |
| R-PAY-9 | 동일 + `isSuccessorRightToMoveIn = true` | `preApproval.lthd = 0` | 승계조합원 §95② 단서 |
| R-PAY-10 | 동일 + 1세대1주택 + 거주 ≥2년 충족 | `preApproval.lthd = 표2 적용` | 1세대1주택 분기 |

**Pre-Do 절차**: R-PAY-2/3/4/5 를 먼저 실행 → 실패 메시지(actual vs expected) 확보 → 의심 경로 A/B/C 중 어느 것이 깨졌는지 확정.

### 3.2 Phase 2 — 원인 경로별 수정

#### 경로 A 수정 (UI → API redevSubject 미전달)

1. `lib/stores/calc-wizard-store.ts` — `initial.redevSubject = ""` 인지 확인. 빈 값이면 결과 화면 진입 전 validate에서 차단.
2. `lib/calc/transfer-tax-validate.ts` — `assetKind === "redevelopment_apt"` 이면 `redevSubject` 필수화 (현재 `"apt"|"right"` 둘 다 허용이면 명시 입력 강제).
3. `lib/calc/transfer-tax-api-helpers.ts:685` — fallback `|| "apt"` 제거 또는 명시 enum 검증 후 throw. UI display fallback이 동일 정책 따르도록 mirror (`feedback_validation_sync_8th_point`, `mirror-pattern`).
4. `components/calc/transfer/RedevelopmentBlock.tsx` §① — 라디오 onChange가 store에 즉시 반영되는지 확인. 미반영 시 `feedback_useeffect_store_mirror_forbidden` 정책 따라 onChange 직접 update.

#### 경로 B 수정 (scaleBranch 후처리에서 분할 손실)

1. `lib/tax-engine/transfer-tax-redevelopment.ts:270-305` — `scaleBranch` 가 `lthd` 까지 12억 안분 가중치를 곱하는지 확인. 분기별 `lthd` 는 이미 분기별 gain 기준 계산이므로 scaleBranch에서 추가 가중 금지.
2. 사례 45(12억 안분) 도입 시 `preApproval.lthd` 산식이 `gain × rate` 인지 `scaleBranch` 후 `gain × rate` 인지 일관성 점검.

#### 경로 C 수정 (preApprovalGain 산식 오류)

1. `lib/tax-engine/redevelopment.ts` (또는 valuation) — `preApprovalGain = rightsValue − acquisitionPrice − preApprovalExpenses` 확인.
2. `oldAcquisitionPrice` 가 `acquisitionPrice` 인지 `salePriceTotal` 인지 확인 (`computeRightPay:357` 입력).

### 3.3 Phase 3 — 결과 화면 분기 분리 표시 (UI)

`components/calc/transfer/FilingFormTable.tsx` (또는 별도 `RedevelopmentDetailCard`):

| 행 | 인가전 | 인가후·청산금 | 합계 |
|---|---:|---:|---:|
| 보유기간 (LTHD 기산) | 16년 6월 | — (LTHD 배제) | — |
| 양도가액 | 권리가액 300,000,000 | 인가후 220,000,000 (= 520M − 300M) | 520,000,000 |
| 취득가액 | 100,000,000 | 권리가액+청산금 390,000,000 | (양식상 100M) |
| 필요경비 | 인가전 0 | 인가후 0 | 0 |
| 양도차익 | 200,000,000 | 220,000,000 | 420,000,000 |
| **장기보유특별공제** | **60,000,000** (30%) | **0 (§95② 단서)** | **60,000,000** |
| 양도소득금액 | 140,000,000 | 220,000,000 | 360,000,000 |

- 사례 47 `옵션 B 4행 분해` 패턴 차용 — `DetailedStatementRedevelopmentBuilders` 활용.
- 안내 카드: "관리처분계획 인가 후 분(인가후 + 청산금)은 소득세법 §95② 단서에 따라 장기보유특별공제 대상에서 제외됩니다." (rose tone `ToggleCard` 또는 안내 alert).
- 보유기간 행 fallback: `feedback_detailed_statement_formula_sync` — `redevelopmentDetail.preApproval/postApproval/settlement` 분기 산식 추가.

### 3.4 Phase 4 — 14개 동기화 지점 점검 (memory `feedback_api_zod_schema_sync`)

| # | 위치 | 확인 |
|---|---|---|
| ① | `AssetForm.redevSubject` | enum `"apt" | "right"` 명시 |
| ② | `initial` | `redevSubject: ""` (강제 입력) 또는 디폴트 정책 결정 |
| ③ | `normalize` | 빈값 → throw or `""` 유지 |
| ④ | `lib/calc/transfer-tax-api.ts` | `buildRedevelopmentPayload(asset)` 호출 시 `redevSubject` 그대로 |
| ⑤ | UI 위젯 | RadioCardGroup `redevSubject` (`RedevelopmentBlock` §①) |
| ⑥ | 사이드바 합계 | 분기별 LTHD 표시 (선택) |
| ⑦ | 결과 카드 | 본 계획서 §3.3 신고서 양식 분리 표시 |
| ⑧ | `transfer-tax-validate.ts` | `redevelopment_apt` + `redevSubject` 미입력 시 차단 |
| ⑨/⑩ | Zod enum | `redevSubject: z.enum(["apt", "right"])` 필수 |
| ⑪ | `acquisitionDate` fallback | 변경 없음 (자산-수준 그대로) |
| ⑫ | Zod 입력 객체 (`redevelopment`) | `subject: z.enum(["apt","right"])` 필수 (현재 그대로) |
| ⑬ | `callTransferTaxAPI` body spread | `redevelopment` 객체 전체 전달 — 변경 없음 |
| ⑭ | Route handler 엔진 input 매핑 | Date 변환 외 변경 없음 |

### 3.5 Phase 5 — 회귀 보호

기존 anchor 회귀 0건 유지:
- 사례 36 (`right` + `settlement="pay"`) — 사례 36 anchor 81,710,000 보존.
- 사례 44 (`apt` + `pay`) — 회귀 0.
- 사례 45 (12억 안분) — 회귀 0.
- 사례 47 (`apt` + `receive` + settlement 비과세) — 회귀 0.
- 사례 48 (승계조합원 신축APT 양도) — 회귀 0.
- 전체 `npx vitest run __tests__/tax-engine/transfer/` 통과.

---

## 4. 케이스 매트릭스 (UI 입력 경로 전수 enumerate — memory `feedback_ui_input_path_enumeration`)

| 케이스 | redevSubject | 청산금 방향 | 조합원 구분 | 1세대1주택 | 12억 초과 | 기대 LTHD |
|---|---|---|---|---|---|---|
| 본 사례 | right | pay | 원조합원 | × | × | 인가전 200M × 30% = 60M |
| R-1 | right | pay | 원조합원 | × | ○ | preApprovalGain × 율 × 12억 안분비 |
| R-2 | right | pay | 원조합원 | ○ (거주 ≥2년) | × | preApprovalGain × 표2율 |
| R-3 | right | pay | 원조합원 | ○ | ○ | 비과세 + 안분 |
| R-4 | right | pay | 승계조합원 | × | × | **0** (§95② 단서) |
| R-5 | right | receive | 원조합원 | × | × | §166①2호 가목 (별도 산식) — 본 PR 범위 외 |
| R-6 | apt | pay | 원조합원 | × | × | 사례 36 — 회귀 보호만 |

본 PR 범위: R-1, R-2, R-4 + 본 사례 4종. R-3·R-5 는 후속 PR.

---

## 5. 작업 순서 (Plan 병렬 / Do 시퀀셜 — memory `feedback_pdca_session_efficiency`)

1. **Plan (병렬)**: `transfer-tax-senior` + `transfer-tax-ui-senior` 단일 메시지 동시 호출 — 본 계획서 검토 + Design 매트릭스 확정.
2. **Pre-Do anchor**: R-PAY-1/2/3/4/5 작성·실행 → 실패 메시지로 의심 경로 A/B/C 확정.
3. **Do (시퀀셜)**:
   - 엔진 시니어 → 의심 경로 수정 + 분기 anchor 통과까지.
   - UI 시니어 → §3.3 결과 화면 분기 분리 표시 + §3.4 14지점 동기화.
4. **Check**: `ui-engine-sync-checker` (read-only) → `bkit:gap-detector` (matchRate ≥ 90).
5. **QA**: 브라우저 수동 (본 사례 + R-1·R-2·R-4) — Network 탭 request body `redevelopment.subject = "right"` 확인.
6. **Act**: 회귀 후속 (R-3·R-5) 명시.

---

## 6. Definition of Done

- [ ] R-PAY-1~10 anchor 모두 통과.
- [ ] 본 사례 입력으로 LTHD = 60,000,000 / 산출세액 anchor 일치 (양도연도 §55 누진세율표).
- [ ] 결과 화면 신고서 양식에 인가전·인가후·합계 3열 분리 표시 (또는 사례 47식 4행 분해).
- [ ] §95② 단서 안내 카드 노출.
- [ ] `feedback_no_yangdo_korea_brand` 준수 — 사례명·anchor 라벨에 브랜드명 금지.
- [ ] 14개 동기화 지점 ⑫⑬⑭ grep 자가 점검 통과.
- [ ] `npx tsc --noEmit` 0건.
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 회귀 0건.
- [ ] 브라우저 수동 확인 완료 (스크린샷 + Network body 신규 필드).
- [ ] memory 업데이트: `project_case_redev_right_lthd_split.md` 신규.

---

## 7. 참고 자료

- 사례 36 계획서: `.claude/plans/case-36-right-to-move-in-with-settlement-pay.md`
- 사례 47 계획서: `.claude/plans/case-47-redev-apt-with-settlement-receive.md` (옵션 B 4행 분해 패턴)
- 사례 48 계획서: `.claude/plans/case-48-redev-successor-member-post-completion.md`
- 엔진 코드:
  - `lib/tax-engine/redevelopment-lthd.ts:103-209` (`computeRightLthd`)
  - `lib/tax-engine/redevelopment-split.ts:355-387` (`computeRightPay`)
  - `lib/tax-engine/transfer-tax-redevelopment.ts:270-326` (`scaleBranch` + 합산)
  - `lib/calc/transfer-tax-api-helpers.ts:682-740` (`buildRedevelopmentPayload`)
- 법령:
  - 소득세법 §95② 단서 — 1세대1주택 등 LTHD 적용 대상 자산 (입주권은 §94①2호로 분류되어 LTHD 적용 제한).
  - 시행령 §166①1호 — 입주권 + 청산금 납부 시 양도차익 산정 (인가후양도차익 + 인가전양도차익).
  - 시행령 §166⑤1호 — 인가전양도차익 보유기간 = 취득일 ~ 관리처분 인가일.
