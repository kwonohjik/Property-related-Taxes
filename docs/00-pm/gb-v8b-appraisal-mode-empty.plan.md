# 일반건물 «감정평가» 안분 모드 선택 후 금액 미입력 — ⑧ V8-b 누락 해소 계획서

> 작성 2026-10-22 · master `4568a1bcb` 기준 · 상태: **✅ Plan 확정 (2026-10-22 사용자 결정 — 권장안: Q-1 증축 × 감정 선택 × 빈칸 통과 유지 · Q-2 «구분 기재» 두 칸 비움은 별건) → Do**
> 관련: `docs/00-pm/gb-and-one-side-appraisal-fe8-12-parity.plan.md` §8 확인 필요 3 · `docs/02-design/features/general-building-sale-split-mode.plan.md`(3지선다·Q-7) · 테스트 `__tests__/calc/gb-sale-split-appraisal-block-review-2026-08-f36.test.ts`(F36) · 짝 계획서 `docs/00-pm/gb-transfer-expense-apportion-basis.plan.md`

## 0. 한 줄 요약

일반건물 양도 정보의 «양도가액 안분 방식» 3지선다에서 **«감정평가»를 골랐는데 토지·건물 감정평가가액을 하나도 입력하지 않으면**, ⑧ validation이 통과시키고 계산은 **조용히 양도시 기준시가 비율로 안분**한다(결과는 «기준시가 안분» 선택과 원 단위까지 같고 판정 흔적도 없다). 주택 split는 같은 상황을 V8-b가 막는다(`transfer-tax-validate-split-sale-std.ts:130`). 겸용도 막는다(`transfer-tax-validate-mixed-use-sale-split.ts:30`). **일반건물만 빠져 있다.**

- **원인**: ⑧ `validateGbSaleAxis`(`transfer-tax-validate-gb-sale.ts:20`)는 «한쪽만 입력»(:37)만 보고 «모드는 감정인데 둘 다 빔»을 보지 않는다. ④는 일반건물 `saleSplitMode`를 와이어에 싣지 않는다(`transfer-tax-api-gb.ts:160-168`) — 엔진의 스위치는 값의 유무다.
- **⑫로는 막을 수 없다**: 모드가 와이어에 없고 Zod에도 없다(`lib/api/transfer-tax-building-schemas.ts` 에 `saleSplitMode` 0건). 모드 없이 감정 키가 없는 요청은 *정당한 «기준시가 안분» 요청*과 구별되지 않는다. 따라서 이 갭은 **⑧(클라이언트) 전용**이며 ⑫ 짝 변경은 **없다**(직접 API 호출자는 «감정평가 모드»를 고를 수 없으므로 침묵 후퇴의 피해자도 아니다).
- **최소 설계**: `validateGbSaleAxis`에 split V8-b와 같은 검사 1개(+4줄). 증축은 제외(F36 계약 유지, Q-1). 기존 테스트 기대값 변경 0건(프로토타입 실측, §5).
- **결정 사항**: 핵심 변경은 *없음*. 부수 쟁점 2건만 선택 가능(§7: 증축 조합 · «구분 기재» 선택 후 두 칸 비움).

## 1. 법령

| 조문 | 내용 | 근거 |
|---|---|---|
| 「부가가치세법 시행령」 §64①1호 | 기준시가가 모두 있으면 기준시가 비례, **다만 감정평가가액이 있는 경우에는 그 가액에 비례**하여 안분 | `get_law_text(mst=283641, jo=제64조)` 시행 2026-02-27 (MCP 2026-10-22) |
| 같은 항 2호 | 어느 하나 또는 모두의 기준시가가 없고 감정평가가액이 있으면 그 가액 비례 | 같은 조 |
| 「소득세법 시행령」 §166⑥ | 가액 구분이 불분명하면 부가령 §64①에 따라 안분 | `get_law_text(mst=290841, jo=제166조)` |

법문은 «감정평가가액이 **있는 경우**»라고 쓰고 «모드»를 모른다. 모드는 화면 개념이고 엔진은 값의 유무로 basis 서열(구분 기재 → 감정평가 → 기준시가)을 고른다(`lib/tax-engine/sale-split-apportion-basis.ts:94` `usableAppraisal`). 이 계획서는 **법령 해석을 새로 더하지 않는다** — «사용자가 고른 방식이 조용히 다른 방식으로 바뀌지 않게 입력 시점에 막는다»는 기존 정책(자동 안분 fallback 금지)의 적용이다.

## 2. 현행 재현 (throwaway probe — scratchpad `gbx/p4.probe.ts`, 제품 파일 무변경)

폼 → ④ `callTransferTaxAPI` body 캡처 → ⑫ route POST, 같은 폼의 ⑧(`collectStepIssues`)과 나란히. 시료: 일반건물 · 분리 OFF · 총 양도가 20억 · 양도시 기준시가 토지 920,550,000 / 건물 300,000,000 · 양도일 2025-06-30.

| 시료 | ⑧ 차단 | ④ 와이어(`saleSplitMode`·감정 키) | ⑫ | 토지 양도가액 | 세액 |
|---|---|---|---|---|---|
| 취득 실가 · «기준시가 안분» | 없음 | 없음 | 200 | 1,508,418,335 | 345,210,000 |
| 취득 실가 · **«감정평가» 빈칸** | **없음** | **없음** | 200 | **1,508,418,335** | **345,210,000** |
| 취득 실가 · «감정평가» 0 / 0 | **없음** | 없음(`\|\| undefined`로 키 소멸) | 200 | 1,508,418,335 | 345,210,000 |
| 취득 실가 · «감정평가» 11억 / 9억 | 없음 | 감정 2키 | 200 | 1,100,000,000 | 345,210,000(같은 날 취득이라 세액은 같고 파트 가액만 바뀜) |
| 취득 실가 · «감정평가» 토지만 | **V8 차단**(양쪽 필요) | 감정 1키 | 200(⑫ 갭은 짝 계획서 소관) | 1,508,418,335 | — |
| 취득 환산 · «기준시가 안분» | 없음 | 없음 | 200 | 1,508,418,335 | 529,295,912 |
| 취득 환산 · **«감정평가» 빈칸** | **없음** | **없음** | 200 | **1,508,418,335** | **529,295,912** |
| (대조) «구분 기재» 선택 · 두 칸 빈칸 | 없음 | 없음(`saleSplitFields`가 값 없는 키를 싣지 않음) | 200 | 1,508,418,335 | 345,210,000 |

- **침묵 후퇴가 확인된다**: «감정평가 빈칸»의 결과는 «기준시가 안분» 선택과 **세액·가액이 같고** 판정 블록도 없다(`saleSplitJudgment` null). 사용자는 자기가 고른 방식이 안 쓰인 사실을 결과 화면에서도 알 수 없다.
- 후퇴 경로: ④ `saleAppraisalFields`(`transfer-tax-api-gb.ts:186-193`)는 모드 게이트가 없고 `parseAmount(...) || undefined`로 빈 값을 키째 지운다 → 엔진 `allocateBundledTransferPrice`(`general-building-valuation.ts:130`) → `resolveSaleApportionBasis`가 `usableAppraisal`(양쪽 > 0) 불성립 → 기준시가 basis. 부분 입력일 때만 `incomplete` 흔적이 남는데(`sale-split-apportion-basis.ts:117-124`) 이 경우는 부분 입력조차 아니라 흔적도 없다.
- 마지막 행은 **같은 모양의 별개 갭**이다(§7 Q-2).

## 3. 화면에 그 모드가 있는가 — 있다

`GeneralBuildingSaleSplitSection.tsx`(`components/calc/transfer/`)는 `SALE_SPLIT_MODE_OPTIONS` 3지선다(구분양도 `actual` / 감정평가 `appraisal` / 기준시가 `apportioned`)를 `RadioCardGroup`으로 렌더하고(:111), `mode === "appraisal"`이면 `SaleAppraisalFields`를 연다(:179-182; 입력은 `data-field="landAppraisalAtTransfer"`·`buildingAppraisalAtTransfer`, `SaleSplitBasisExemptionCards.tsx:131`). 기본값은 `apportioned`(`calc-wizard-asset-factory.ts:221`). 전환 patch는 `saleSplitModePatch`(`transfer-tax-split-acq-mode.ts:51-61`)가 `appraisal` 선택 시 구분값만 비우고 감정값은 남긴다.

⇒ 사용자는 «감정평가»를 고르고 칸을 비운 채 «다음»을 누르는 상태를 **정상 경로로 만들 수 있다.** 주택 split(`LandBuildingSaleSplitSection`)·겸용(`MixedUseSaleSplitSection`)과 같은 3지선다 UI인데 ⑧ 짝만 비어 있다.

## 4. split · 겸용 대조 (file:line)

| 경로 | «감정평가 선택 + 둘 다 빔» | «한쪽만 입력» | «구분 기재 선택 + 둘 다 빔» |
|---|---|---|---|
| 주택 split | ✅ V8-b `transfer-tax-validate-split-sale-std.ts:130-132` — 오류 필드 `landAppraisalAtTransfer` | ✅ V8 `:115-119` | ❌ 코드 판독상 없음(probe 미수행) |
| 겸용 | ✅ `transfer-tax-validate-mixed-use-sale-split.ts:30-32` | ✅ `:33-35` | ✅ `:37-` `mode === "actual"`이면 두 칸 필수 |
| **일반건물** | ❌ **없음** | ✅ `transfer-tax-validate-gb-sale.ts:37-39` | ❌ 없음 |

- split V8-b 주석(`:121-129`)이 이유를 적는다 — «엔진 스위치는 모드가 아니라 **값의 유무**다. 모드만 고르고 금액을 비우면 basis 서열에서 감정평가가 빠져 **조용히 기준시가로 안분**된다 — 사용자는 자기가 고른 방식이 안 쓰인 사실을 모른다(자동 fallback 금지).» 일반건물에 그대로 해당한다.
- 필드 점프 E2E에 split V8-b 케이스가 이미 있다(`e2e/_helpers/validation-field-jump-cases-leaf.ts:335` «split 감정평가 선택 후 미입력»). 일반건물 쪽에는 «한쪽만»(`-gb.ts:381-388`)·«증축 + 감정»(`:389-392`)뿐이고 이 케이스가 없다.
- 지분(축 B) 후속 카드는 `axisBEffectiveAsset`(`lib/calc/axis-b-effective-asset.ts`)이 첫 카드의 물건-수준 값(`saleSplitMode` 포함 — `transfer-tax-api-gb-shares.ts:65`)을 병합해 검증하므로 새 검사도 후속 카드에 같은 경로로 걸린다(기존 V8 «한쪽만»과 동일 거동).

## 5. 설계 (최소 변경)

### 5.1 ⑧ — `lib/calc/transfer-tax-validate-gb-sale.ts`

V8 «한쪽만»(`:37`) 바로 뒤에 split V8-b와 **같은 문구·같은 오류 필드**로 한 검사를 더한다.

```ts
if (asset.saleSplitMode === "appraisal" && !anyAppraisal && !asset.gbHasExtension) {
  return fieldError("landAppraisalAtTransfer", `${label}: 「감정평가」를 선택했으면 토지·건물 감정평가가액을 입력하세요 — 비워두면 양도시 기준시가 비율로 안분됩니다 (부가가치세법 시행령 §64①1호 단서).`);
}
```

- `anyAppraisal`은 이미 `landApp > 0 || buildingApp > 0`(`transfer-tax-validate-gb-sale.ts:30-32`)이다. split의 `opt()`(0 → undefined)와 **같은 술어**라 «0 / 0»도 빈칸으로 본다(§2 표 3행).
- **증축은 제외한다** — `!asset.gbHasExtension`. 증축에서는 UI가 감정 선택지를 비활성화하고(`GeneralBuildingSaleSplitSection.tsx:92-97`) 값이 있어도 차단하며(`:60-63`), 기존 계약 F36 «**감정평가가액이 없으면 감정 모드여도 통과한다 — 차단 사유는 감정값이다**»(`gb-sale-split-appraisal-block-review-2026-08-f36.test.ts`)가 증축·빈칸 통과를 명시한다. 이 계약을 이번에 뒤집을지는 Q-1이다.
- 부담부증여는 `validateGeneralBuildingAsset`이 BG 분기에서 먼저 종결하고(`transfer-tax-validate-gb.ts:96`, UI도 `blockedReason`으로 모드 선택을 닫는다) 이 검사에 도달하지 않는다.
- 문구가 split와 같으므로 필드 점프 정규식 `^자산: 「감정평가」를 선택했으면 토지·건물 감정평가가액을 입력하세요`를 재사용한다.

### 5.2 ④ · ⑫ · 엔진

| 지점 | 판단 |
|---|---|
| ④ 변환 | 무변경 — `saleSplitMode`를 와이어에 싣지 않는 현행(Q-7 종결: 엔진이 모드를 읽지 않는다) 유지. 새 키를 싣지 않는다 |
| ⑫ Zod | **변경 없음·불가** — 모드가 와이어에 없다. 감정 키가 없는 요청은 정당한 기준시가 안분 요청이므로 서버는 침묵 후퇴와 구별할 수 없다. 모드를 와이어에 싣는 안은 «엔진이 읽지 않는 플래그를 나르면 죽은 모드가 다시 생긴다»(`transfer-tax-api-gb.ts:160-168`)는 기존 결정과 충돌해 채택하지 않는다 |
| 엔진 | 무변경 — 후퇴(`usableAppraisal` 불성립 → 기준시가)는 직접 엔진 호출의 안전망으로 남는다 |

### 5.3 14개 동기화 지점 · 3중 패턴

| 지점 | 판단 |
|---|---|
| ①②③ | 무변경 |
| ④ | 무변경 (술어 일치 확인: ④는 `parseAmount(x) \|\| undefined`, ⑧은 `parseAmount(x) \|\| 0` > 0 — 같은 «양수일 때만 값» 규약) |
| ⑤ UI | 무변경 — 오류 필드 `landAppraisalAtTransfer`는 이미 `mode==="appraisal"`에서 렌더되는 입력이다(필드 점프 대상 존재). 감정평가 선택지가 활성인 한 사용자가 오류를 해소할 칸이 있어 dead-end가 아니다 |
| ⑥ 사이드바 · ⑦ 결과 | 무변경 |
| **⑧ validate** | **변경 — 이 계획서의 본체** |
| ⑨⑩⑪⑬⑭ | 무변경 |
| ⑫ | 변경 없음(§5.2 근거 명시) |

정책 자가 점검: useEstimatedAcquisition류 미러링 없음 · 자동 안분 fallback을 **줄이는** 변경 · UI 통과↔validate 차단 모순 없음(오류 필드의 입력 칸이 항상 열려 있음).

### 5.4 하지 않는 것

- «구분 기재» 선택 후 두 칸 비움 처리(Q-2) · 증축 조합 변경(Q-1) · 엔진·와이어 변경 · UI 문구 변경.

## 6. 검증 계획

### 6.1 프로토타입 실측 (cp 백업 → 임시 변경 → 원복 sha 일치)

`transfer-tax-validate-gb-sale.ts`에 환경변수 게이트로 §5.1 검사를 넣고(증축 확장 변형 포함) `__tests__/calc` `__tests__/components` `__tests__/lib`를 돌렸다 — **1,523파일 17,929건 중 1건 실패**, 그 1건은 F36 «증축 × 감정 빈칸 통과» 계약이다(**증축 확장 변형에서만**). 증축 제외 변형(권장안)은 해당 계약을 건드리지 않는다. 기존 테스트 중 GB 감정평가 모드·빈칸을 통과시키는 기대값은 그 외에 없다. 원복: sha256 `c7b31d9e2fe6…032b` 일치, `git status` clean.
- ⚠️ 프로토타입은 두 변형을 한 번에 돌렸다. 증축 제외 단독 실행은 *재실행하지 않았다* — 위 판정은 실패 메시지(증축 문구)로 분리한 것이다.
- E2E · 브라우저 미수행.

### 6.2 anchor — 신규 `__tests__/calc/gb-v8b-appraisal-mode-empty.test.ts`

| ID | 내용 | 기대 |
|---|---|---|
| V-1 | 증축 없음 · `appraisal` · 감정 두 칸 빈칸 | 오류 문구 `「감정평가」를 선택했으면…`, 필드 `landAppraisalAtTransfer` (**수정 전 null — 실패 기록**) |
| V-2 | `appraisal` · `"0"` / `"0"` | V-1과 같은 오류 |
| V-3 | `appraisal` · 양쪽 입력 | null |
| V-4 | `appraisal` · 한쪽만 | V8(`양쪽 모두 필요`) 문구 — V8-b가 아님(순서 보장) |
| V-5 | `apportioned`·모드 미지정(레거시) · 빈칸 | null (잔존 감정값 보호와 같은 이유) |
| V-6 | `actual` · 빈칸 | null (V8-b는 `appraisal` 전용 — Q-2 미채택 시 계약 고정) |
| V-7 | 증축 있음 · `appraisal` · 빈칸 | null (F36 계약 유지 — Q-1 (a)) |
| V-8 | 환산 취득 · `appraisal` · 빈칸 | V-1과 같은 오류 (취득 방식 무관) |
| V-9 | 지분(축 B) 후속 카드: 첫 카드 `appraisal`·빈칸 | 후속 카드 인덱스에도 같은 오류(`axisBEffectiveAsset` 병합) |
| V-10 | **split ↔ 일반건물 격자**: 모드 3 × 감정 {없음·양쪽·토지만·건물만·0/0} (증축 없음) → ⑧ 차단 여부 일치 | 15셀 전수 일치(split V8·V8-b와 같은 판정) |
| V-11 | ④ 대조: `appraisal`+빈칸 body에 `saleSplitMode`·감정 키가 **없다** | 와이어 계약 고정 — ⑧이 막는 이유의 증거 |
| V-12 | 필드 점프 E2E 케이스 1건 추가(`validation-field-jump-cases-gb.ts`) — `gb: landAppraisalAtTransfer (감정평가 선택 후 미입력)` | CI 샤드 |

### 6.3 뮤테이션 (cp 백업 → 변형 → 대상 테스트 → sha 원복 · git checkout/stash 금지)

| # | 변이 | 기대 |
|---|---|---|
| M-1 | 검사 제거 | V-1·V-2·V-8·V-9·V-10 KILLED |
| M-2 | `!anyAppraisal` → `anyAppraisal` | V-1·V-3 KILLED |
| M-3 | `"appraisal"` → `"actual"` | V-1 KILLED, V-6 KILLED |
| M-4 | `!asset.gbHasExtension` 제거 | V-7 + 기존 F36 계약 KILLED |
| M-5 | `anyAppraisal` 대신 `landApp<=0 \|\| buildingApp<=0`(한쪽만도 V8-b로 흡수) | V-4 KILLED(문구) |
| M-6 | 오류 필드를 `buildingAppraisalAtTransfer`로 | V-1(필드 단언) · V-12 KILLED |
| M-7 | 검사를 V8 «한쪽만» 앞으로 이동 | V-4: 한쪽만일 때 `anyAppraisal`이 참이라 영향 없음 → SURVIVED 가능 — 위치 단언이 필요 없는지 실측 후 판정 |

## 7. 사용자 결정

**핵심 변경(§5.1)은 결정 사항 없음** — split·겸용이 이미 같은 규칙이고 법령 해석이 새로 들어가지 않는다. 아래는 선택 가능한 부수 쟁점이다.

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 증축 × «감정평가» 선택 × 빈칸 (현행: 통과 — F36 계약, 결과는 3-way 기준시가 안분) | (a) 통과 유지 (b) 막기 — 기존 증축 문구(`증축이 있는 건물에서는 감정평가가액으로 안분할 수 없습니다…`)로 차단, F36 단언 1건 갱신 | **(a)** — 증축에서는 감정 선택지 자체가 비활성이라 사용자의 새 선택이 아니고, 이번 요청 범위(모드 + 금액 없음)의 핵심이 아니다. (b)는 자동 fallback 금지 원칙상 일관되나 *기존에 의도적으로 고정한 계약을 뒤집는다* |
| Q-2 | «**구분 기재**» 선택 + 두 칸 비움(§2 대조 행) — 일반건물·split 모두 ⑧ 없음, 겸용만 차단 | (a) 별건 (b) 이번에 일반건물만 (c) 일반건물 + split 함께 | **(a) 별건** — UI 문구가 «미입력 시 나머지에서 자동 계산»이라 한쪽 비움은 정상이고 *둘 다 비움*만 걸러야 해 사용자 흐름을 건드린다. 일반건물만 바꾸면 split와 비대칭이 새로 생기므로 (c)가 필요하면 split 계획으로 묶는다 |

## 8. 확인 필요 · 미검증

1. 증축 제외 변형 단독 전체 테스트는 재실행하지 않았다(§6.1).
2. E2E(필드 점프 spec) · 브라우저 미수행. 새 케이스의 기대 정규식·`form` 팩토리(`gb({ saleSplitMode: "appraisal" })`)는 *Do 시* 확인.
3. 지분(축 B) 후속 카드에서 오류가 카드마다 반복되는 UX(첫 카드에만 입력 칸이 있음)는 기존 V8과 같은 거동이라 새 위험으로 보지 않았으나, V-9 anchor로 *실측 확인*한다.
4. «구분 기재 + 두 칸 비움»의 split 쪽 침묵 후퇴는 코드 판독만 했다(probe 미수행).
5. 이 갭의 사용 빈도는 알 수 없다(telemetry 없음). 기본값이 `apportioned`라 사용자가 감정평가를 직접 골라야 발생한다.

## 9. Do 순서 · PR

0. anchor V-1~V-11 먼저 — 수정 전 실패 기록(V-1·V-2·V-8·V-9·V-10)
1. `validateGbSaleAxis`에 검사 추가
2. 필드 점프 E2E 케이스 1건 추가
3. 뮤테이션 M-1~M-7
4. `npx tsc --noEmit` · `npm run lint` · `npm run test:transfer` · pre-push
5. 브라우저(Playwright) 1회: 일반건물 → 양도 정보 «감정평가» 선택·빈칸 → «다음» → 차단 문구와 입력 칸 포커스 이동 확인

**PR 1건**(제품 1파일 +4줄 · 테스트 1 · E2E helper 1줄). 짝 계획서(양도비 배분 기준)와 파일이 겹치지 않아 순서 무관.
