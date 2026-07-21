# 양도세 표준·상가 자산 증여취득 §163⑨ 추계모드 차단 (block) — 수정 계획서

> **상태**: Plan (Do 미착수)
> **작성**: 2026-07-21 (13단계 자가검토 STEP1~4 반영)
> **규모**: 중 (validation 2 guard + `hasPre1990` API/validate 게이트 · 엔진 input/result 타입 무변경 → `.engine.design.md`/`.ui.design.md` N/A)
> **선행**: 겸용 #726 · GB·재개발 #727 (동일 §163⑨ 증여 추계 차단) — 본 건은 그 4경로에서 **누락된 표준·상가** + 추계 3모드(환산·감정·매매사례) + pre1990 래치를 마무리
> **정합 메모리**: [[project_transfer_special_engine_gift_acquisition_163_9_gap]] (⚠️ "표준·상가 ✅안전" 결론 오검증 — 본 계획으로 정정)

---

## 1. 배경 — 확정 버그 (probe 실측)

증여로 취득한 **표준 자산(주택·토지·건물 등 generic 경로)·상업용건물**에서 UI 추계 모드(**환산취득가·감정가액·매매사례가액**, 또는 토지 **pre1990 토지등급 래치**)를 선택하면, §163⑨상 취득가액으로 써야 할 **증여 신고가액이 무시되고 추계값 + 개산공제(§163⑥)가 적용**된다. 겸용(#726)·일반건물(#727)·재개발(#727)에는 이미 차단 로직이 있으나 표준·상가는 없다. (GB는 감정·매매사례가 UI 미노출이라 환산만 차단했으나, 표준·상가는 두 모드가 노출됨.)

### 1.1 엔진 probe 실측 (2026-07-21)
표준 건물, 증여 신고가액 5억, 양도가 10억, 취득기준시가 3억, 양도기준시가 9억:

| 모드 | 취득가액 | 양도차익 | 판정 |
|---|---|---|---|
| 실거래가(신고가액) | 500,000,000 | **500,000,000** | ✅ §163⑨ 정답 |
| 환산 | 환산 333,333,333 + 개산공제 9,000,000 | **657,666,667** | 🔴 신고가액 무시 |

→ **차익 약 157,666,667 과대**, 누진세율에서 6천만원대 세액 오차 (silent 오세액).

### 1.2 도달 경로 4-링크 (전부 실측)
| # | 링크 | 위치 | 현행 |
|---|---|---|---|
| UI | 환산 버튼 노출 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:309` | `transferType !== "burdened_gift" && assetKind !== "redevelopment_apt"`만 게이트 — `acquisitionCause` 무관 → gift에서도 환산 선택 가능 |
| Validation | 증여 신고가액 검증 스킵 | `lib/calc/transfer-tax-validate-asset.ts:573` | `if (!isEstimated && !hasPre1990)` 안에 gift 신고가액 필수검증(577-581) → 환산 선택(isEstimated=true) 시 통째 스킵 |
| API(primary) | 환산 플래그 통과 | `lib/calc/transfer-tax-api.ts:258-263` | 표준 gift→`isEstimated`(true) 통과 · 상가 gift→`primary.useEstimatedAcquisition`(true) 통과. **상속만** false 처리(:260) |
| Engine | 환산 적용 | 표준 `calcTransferGain` · 상가 `applyCommercialBuildingStep`(`transfer-tax-commercial-step.ts:124`) | `useEstimatedAcquisition=true` → 환산, 신고가액 무시. 상가 STEP 0.35 가드도 **inheritance만** 스킵 |

### 1.3 상속은 왜 안전한가 (대조 — 정당한 메커니즘)
`runInheritedAcquisitionStep`(`lib/tax-engine/transfer-tax.ts:122`, `inheritance-acquisition-helpers.ts:39`)이 `rawInput.inheritedAcquisition` payload만 있으면 **`useEstimatedAcquisition` 플래그와 무관하게** §163⑨ 의제가액으로 `acquisitionPrice` override + `useEstimatedAcquisition=false` 세팅. 상가는 STEP 0.35 진입 전 STEP 0.45가 먼저 실행(commercial-step.ts:119 주석). P2c가 상속 취득가액을 항상 payload로 전송 → 환산 선택해도 보호됨.
→ **gift에는 이 override step이 없다** (표준·상가). 이것이 비대칭의 원인이자 본 버그의 본질.

### 1.4 메모리 오검증 정정
`project_transfer_special_engine_gift_acquisition_163_9_gap.md`가 "표준·상가 ✅안전"의 근거로 든 `transfer-tax-api-helpers.ts:460` null화(`acquisitionCause === "purchase" ? ... : undefined`)는 **companion(동반) 자산 빌더 전용**이다. **primary(단일/주) 자산**은 `transfer-tax-api.ts:258-263`을 타며 gift를 null화하지 않는다 → 오귀속. (단일 자산 계산이 더 흔한 경로이므로 실사용 도달성 높음.)

---

## 2. 법령 근거 (선행 검증분 재사용 — KoreanLaw 위임체인 확인 완료)

| 조문 | 적용 |
|---|---|
| 소득세법 시행령 §163⑨ | 증여받은 자산은 **증여일 현재 상증법 §60~66 평가액(증여 신고가액)을 취득당시 실지거래가액으로 의제** → 취득가액 항상 "확인 가능" |
| 소득세법 시행령 §176의2②③ | 환산·추계는 **실지거래가액을 확인할 수 없는 경우에 한함**(보충적) → 신고가액 확인 가능한 증여에 환산 적용은 법적 불필요·위반 |
| 소득세법 시행령 §176의2④ | 의제취득일(1985-01-01) 전 취득 자산은 상속·증여 포함 환산 대상 → **pre-1985 증여는 게이트 제외**(기존 환산 fallback 유지·회귀-safe) |
| [[feedback_no_unfavorable_application_without_legal_basis]] | 환산이 신고가액보다 클 수도(불리)·작을 수도(유리) 있으나, 법령상 취득가액은 §163⑨ 신고가액으로 **확정** — 모드 선택으로 갈리면 안 됨 |

> §163⑨/§176의2④/§164⑤~⑦ 미공시 max는 겸용·GB·재개발 수정 시 법제처 원문(MST 소득세법 280405·소령 286211)으로 검증 완료. 본 건은 그 결론 재사용(신규 인용 없음).

---

## 3. 케이스 매트릭스 (자산 × 취득원인 × 모드)

> **"표준"의 범위** = validate-asset.ts generic 취득가액 섹션(462-620)에 도달하는 **모든 자산**(주택·토지·건물·분양권 등). commercial_building(:104·134)·general_building(:182)·redevelopment_apt/right_to_move_in(:189)·mixed-use(:270)·carryover_gift(:198)는 그 이전에 return/위임되어 자동 제외 → assetKind 열거 불요. §163⑨은 자산종류 무관 전 증여자산에 적용되므로 positional 게이트가 오히려 정확.

| 자산 | 취득원인 | 모드 | 현행 | 목표 | probe |
|---|---|---|---|---|---|
| 표준(generic) | 증여 (≥1985) | 실거래가 | ✅ 신고가액 사용(577-581) | 유지 | 차익 500M(정답) |
| 표준 | 증여 (≥1985) | **환산** | 🔴 환산·신고가액 무시 | **차단**(실가 강제) | 657,666,667 |
| 표준 | 증여 (≥1985) | **감정가액** | 🔴 감정값+개산공제(§163⑥) 오적용 | **차단** | 491,000,000 |
| 표준 | 증여 (≥1985) | **매매사례** | 🔴 사례값 대체+개산공제 오적용 | **차단** | 541,000,000 |
| 표준(land) | 증여 (≥1985) | **pre1990 토지등급** | 🔴 `hasPre1990`→acquisitionPrice=0·토지등급 환산(uncleaable 래치 stale) | **차단**(hasPre1990 게이트) | — |
| 표준 | 증여 (<1985) | 환산/토지등급 | 의제취득(§176의2④) | 유지(게이트 제외·회귀-safe) | — |
| 상가건물 | 증여 (≥1985) | 실거래가 | ✅ 신고가액(fall-through 577-581) | 유지 | — |
| 상가건물 | 증여 (≥1985) | **환산·감정·매매사례** | 🔴 §164⑧ 환산 등·신고가액 무시 | **차단**(실가 강제) | — |
| 상가건물 | 증여 (<1985) | 환산 | 환산 | 유지(게이트 제외) | — |
| 표준·상가 | 상속 | 환산/실가 | ✅ payload override 보호(runInheritedAcquisitionStep) | 유지(무변경) | — |
| 겸용·일반건물·재개발 | 증여 | 환산 | ✅ 이미 차단(#726/#727) | 무변경 | — |
| 부담부증여(transferType) | — | — | UI가 추계모드 미노출(:309) | 게이트 제외 | — |

> 상가는 land 아님 → pre1990 토지등급 N/A. 감정·매매사례는 general_building만 UI 미노출(:366)이고 상가·표준은 노출됨.

---

## 4. 수정 설계 — §163⑨ 추계모드 차단 (validation 2 guard + hasPre1990 게이트 2)

**핵심 원리**: 증여 신고가액=실지거래가액(§163⑨)이라 **항상 확인 가능** → 양도세 취득가액 **추계(§176의2 환산·감정·매매사례·pre1990 토지등급)는 법적 불필요·위반**. post-1985 증여는 **실거래가 모드(신고가액=취득가액)를 강제**한다. GB #727(`transfer-tax-validate-gb.ts:106-124`)·재개발과 동형 block 방식(Surgical), 단 표준·상가는 GB와 달리 감정·매매사례 모드가 UI에 노출(:366은 general_building만 숨김)되고 land pre1990 래치가 있어 **차단 대상이 넓다**.

**검증된 전제(실측, 추정 아님)**:
- gift 실거래가(isEstimated=false·비추계) → `acquisitionPrice = parseAmount(primary.fixedAcquisitionPrice)`(신고가액) — `transfer-tax-api.ts:213-225` 실측. 상가는 `applyCommercialBuildingStep` 게이트(commercial-step.ts:115)가 `useEstimatedAcquisition` 요구 → 실거래가면 환산 미발동, `calcTransferGain`이 신고가액 직접 차감. 표준은 generic 블록(:577-581)이 신고가액+`donorAcquisitionDate` 필수화. → **모드만 실거래가로 강제하면 §163⑨ 정합 자동 성립**.

### 4.1 상가건물 gift 추계모드 차단 — `transfer-tax-validate-asset.ts`
상속 pre-intercept(현행 :104-130, `return null`) **직후**에 gift 인터셉트 추가. 추계 3모드 차단(신고가액+증여자취득일 필수는 generic :577-581 fall-through가 처리):

```ts
// ── 상업용건물 + 증여(post-1985) + 추계모드 = §163⑨ 위반 차단 (실거래가 강제) ──
// 증여 신고가액(=증여일 §60~66 평가액)은 항상 확인 가능 → 추계(환산·감정·매매사례) 불필요.
// 실거래가 모드로 강제하면 아래 generic 취득가액 블록(:577-581)이 신고가액+증여자취득일을 필수화한다.
// pre-1985는 §176의2④ 의제취득 영역이라 제외. (상가는 land 아님 → pre1990 N/A)
if (
  asset.assetKind === "commercial_building" &&
  asset.acquisitionCause === "gift" &&
  (asset.acquisitionDate ?? "") >= "1985-01-01" &&
  (asset.useEstimatedAcquisition || asset.isAppraisalAcquisition || asset.isSalesCaseAcquisition)
) {
  return `${label}: 증여 취득 상업용건물은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다. 실거래가 모드로 증여일 평가액(신고가액)을 취득가액으로 입력하세요. (소득세법 시행령 §163⑨)`;
}
```

### 4.2 표준(generic 경로) gift 추계모드 차단 — `transfer-tax-validate-asset.ts`
**배치 위치(STEP 3 정정)**: `isEstimated`/`hasPre1990` 정의(현행 :459-462) **직후, 매매사례 블록(:465 `if (isSalesCase) { ... return null; }`) 이전**. ⚠️ salesCase는 :465에서 조기 return하므로 ":573 직전"에 두면 매매사례 gift를 놓친다 → 반드시 :465 앞. 이 지점은 commercial(:104·134)·GB(:182)·재개발(:189)·겸용(:270)·carryover_gift(:198) 모두 조기 return/위임된 뒤라 **generic 경로 자산(주택·토지·건물·분양권 등) 전용** → assetKind 제외 불요:

```ts
// ── 표준(generic) 자산 + 증여(post-1985) + 추계모드 = §163⑨ 위반 차단 (실거래가 강제) ──
// 여기 도달분은 generic 경로 자산(commercial/GB/redev/mixed/carryover는 위에서 return/위임).
// ⚠️ salesCase 블록(:465 return)·isAppraisal generic(:573)보다 먼저 실행되도록 :462 직후 배치.
// pre1990 토지등급은 hasPre1990 게이트(§4.3)가 처리 → 여기선 useEstimatedAcquisition/감정/매매사례 flag만.
// 차단 후(실거래가로 유도) :577-581 gift 블록이 신고가액+증여자취득일 필수화. pre-1985는 §176의2④ 의제취득 → 제외.
if (
  asset.acquisitionCause === "gift" &&
  asset.transferType !== "burdened_gift" &&
  (asset.acquisitionDate ?? "") >= "1985-01-01" &&
  (asset.useEstimatedAcquisition || asset.isAppraisalAcquisition || asset.isSalesCaseAcquisition)
) {
  return `${label}: 증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다. 실거래가 모드로 증여일 평가액(신고가액)을 취득가액으로 입력하세요. (소득세법 시행령 §163⑨)`;
}
```

### 4.3 pre1990 토지등급 래치 게이트 — `transfer-tax-api.ts:86` + `transfer-tax-validate-asset.ts:462`
`pre1990Enabled`은 환산 클릭 시 set되는 **uncleaable 수렴 래치**(`CompanionAcqPurchaseBlock.tsx:92-102`, set만·clear 없음). 환산→실거래가 전환 시 stale true로 남으면 `useEstimatedAcquisition=false`인데도 `hasPre1990=true` → §4.1/4.2 guard(추계모드 flag 검사)와 generic :573(`!hasPre1990`)을 **모두 우회** → api:214 `acquisitionPrice=0`·토지등급 환산으로 신고가액 무시. **guard로는 잡을 수 없다(래치 clear 불가 → dead-end 위험)**. 따라서 `hasPre1990` **정의 자체를 post-1985 gift에서 false**로 게이트(2곳 동일):

**⚠️ 변수 prefix 파일별 상이(STEP 3 실측)**: `transfer-tax-api.ts:86`은 `primary.`, `transfer-tax-validate-asset.ts:462`는 `asset.` — 동일 게이트식을 각 prefix로 적용:

```ts
// transfer-tax-api.ts:86
const hasPre1990 =
  (primary.pre1990Enabled ?? false) && primary.assetKind === "land" &&
  !(primary.acquisitionCause === "gift" && (primary.acquisitionDate ?? "") >= "1985-01-01");

// transfer-tax-validate-asset.ts:462
const hasPre1990 =
  (asset.pre1990Enabled ?? false) && asset.assetKind === "land" &&
  !(asset.acquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01");
```
→ post-1985 gift land: `hasPre1990=false` → api `acquisitionPrice=fixedAcquisitionPrice`(신고가액)·pre1990 payload 미전송(:655), validate generic :573 진입 → :577-581 신고가액 필수. pre-1985 gift·비-gift는 기존 동작 유지(회귀-safe). UI는 pre1990 입력이 환산 모드(차단됨)에서만 렌더되므로 표시 불일치 없음.

### 4.4 명시적으로 채택하지 않은 옵션
- **API null-out**(추계 flag를 API에서 false화): 정상 UI 경로는 validation이 submit 전 차단하므로 불요. crafted API 요청(route.ts는 client validator 미호출·Zod만) 우회는 코드베이스 전반의 기존 Low → GB #727도 미채택, 동형 유지. (단 pre1990 래치는 uncleaable라 §4.3 API 게이트가 유일 해법이므로 예외적 API 변경.)
- **엔진 throw 가드**: 회귀면적 크고 block으로 사용자 경로 완전 차단되므로 미채택.
- **감정·매매사례를 §163⑨ §60~66 평가액 입력창으로 허용**: §60~66은 감정·매매사례를 시가로 인정하나, 그 값은 **실거래가 모드의 신고가액**으로 입력하면 되고(개산공제 없음), 양도세 추계모드(개산공제 §163⑥ 자동적용)는 별개 → 차단이 정합.

---

## 5. Anchor 계획 (Pre-Do 우선 — RED→GREEN)

**validation anchor** `__tests__/lib/calc/standard-commercial-gift-163-9-block.anchor.test.ts`:

| # | 케이스 | 기대 |
|---|---|---|
| A1 | 표준 건물 gift(2018) + 환산ON | 오류(추계 미지원 메시지) |
| A2 | 표준 토지 gift(2018) + 환산ON | 오류 |
| A3 | 표준 건물 gift(2018) + **감정가액ON** | 오류 |
| A4 | 표준 건물 gift(2018) + **매매사례ON** | 오류 |
| A5 | 표준 건물 gift + 실거래가 + 신고가액 5억 + 증여자취득일 | 통과(null) |
| A6 | 표준 건물 gift(1983, pre-1985) + 환산ON | **통과**(의제취득·회귀 제외) |
| A7 | 상가 gift(2018) + 환산ON | 오류 |
| A8 | 상가 gift(2018) + 감정가액ON | 오류 |
| A9 | 상가 gift + 실거래가 + 신고가액 + 증여자취득일 | 통과 |
| A10 | 표준 건물 **상속** + 환산ON | 통과(무변경·회귀 가드) |
| A11 | 부담부증여(transferType) + 환산 | gift 추계 가드 미발동(회귀) |

**hasPre1990 게이트 anchor**(§4.3) `__tests__/lib/calc/*-api*` 또는 validate:
| # | 케이스 | 기대 |
|---|---|---|
| B1 | land gift(1987) + pre1990Enabled=true(stale) + 실거래가 | API `hasPre1990=false`·`acquisitionPrice=신고가액` / validate 신고가액 필수 |
| B2 | land gift(1983, <1985) + pre1990Enabled | `hasPre1990=true`(기존 의제취득 유지·회귀) |
| B3 | land **purchase** + pre1990Enabled(1987) | `hasPre1990=true`(비-gift 무변경·회귀) |

**엔진 회귀 anchor**: §1.1/§3 probe 고정 테스트 — gift 실거래가 차익=500,000,000 (정답 경로 보존).

---

## 6. 14 동기화 지점 (validation ⑧ + API ④ 부분)

엔진 input/result 타입 **무변경** → ①②③⑤⑥⑦⑨⑩⑫⑬ 해당 없음.
- **⑧ Validation**(`transfer-tax-validate-asset.ts`): gift 추계모드 가드 2개(§4.1·4.2) + `hasPre1990` 게이트(§4.3, :462).
- **④ API**(`transfer-tax-api.ts:86`): `hasPre1990` 정의에 gift 게이트(§4.3) — pre1990 uncleaable 래치의 유일 해법(⑧과 동일 소스식으로 미러 → 3중 패턴 준수: API·validate 동일 게이트).
- ⑤ UI(CompanionAcqPurchaseBlock:309): 추계 라디오를 gift에서 숨기는 대안 있으나 GB #727 동형(노출·선택 시 차단 메시지) → 무변경.
- ⑭ Route: 무변경(엔진 input 필드 신규 없음).

---

## 7. 검증 체크리스트 (Do 완료 기준)

- [ ] validation anchor A1~A11 + hasPre1990 anchor B1~B3 RED→GREEN
- [ ] `npx tsc --noEmit` 0
- [ ] `npx vitest run __tests__/lib/calc/` + `__tests__/tax-engine/transfer/` 회귀 0
- [ ] 전체 `npm test` 회귀 0
- [ ] lint 0
- [ ] `hasPre1990` 게이트 API·validate **2곳 동일 소스식** 확인(3중 패턴)
- [ ] 코드리뷰(transfer-tax-qa) High/Medium 0
- [ ] 메모리 `project_transfer_special_engine_gift_acquisition_163_9_gap.md` "표준·상가 안전"(오검증) → "표준·상가 gift 추계모드(환산·감정·매매사례·pre1990) §163⑨ 차단 완료"로 정정

---

## 8. 경계·비범위 (명시)

- **범위 밖(무변경)**: 상속(payload override 보호·`runInheritedAcquisitionStep`)·pre-1985 증여(의제취득 §176의2④)·겸용/GB/재개발(기 수정 #726/#727)·부담부증여(UI 추계모드 미노출 :309).
- **자동 안전(본 block 부수효과)**: 상가·표준 gift + §164⑨ 공익수용 / §164⑤ PHD 미공시 조합 — 추계모드 자체가 차단되므로 해당 특례 경로 미도달.
- **감정·매매사례 = 본 건 범위 내**(원안에서 승격): #726/#727은 이 모드가 UI 미노출(general_building :366)이라 미해당이었으나 표준·상가는 노출 → probe로 §163⑨ 위반(개산공제 오적용·사례값 대체) 확정 → 차단 포함.
