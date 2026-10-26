# PHD 남은 한계 3건 수정 계획서 — §164⑤ 확인란 · 서버 메시지 · 이월과세 APD 주택 종류

> 상위 계획서: `docs/00-pm/phd-fill-164-6-apartment.plan.md` §9.3 「바뀌지 않는 것」 · PR #2541 후속
> 작성 2026-10-26 · 기준 master `b476b8c42` · **상태: 구현 완료(§7) — 사용자 결정 Q-1 (a) · Q-2 (a) · Q-3 (b) (2026-10-26)**
> 용어: §164⑥·⑦ 산식 결과는 단독·다가구 «환산 개별주택가격», 공동주택 «환산 공동주택가격»이다. 겸용주택에는 공동주택이 없다(상위 계획서 §9.5-1, 재제안 금지).

---

## 0. 요약

| # | 한계 | 영향 | 권장안 | 바뀌는 층 |
|---|---|---|---|---|
| L-1 | 보조 카드의 «§164⑤ 준용으로 산정한 금액입니다» 확인란이 건물 기준시가 칸을 고쳐도 풀리지 않는다 | 확인 뒤 다른 값으로 고쳐도 «계산해 채우기» 버튼이 켜진 채 남는다 | **Q-1 (a)** 칸을 고치면 같은 patch에서 확인을 푼다(상가 선례) | ⑤ 1파일 |
| L-2 | 서버 Zod 메시지가 공동주택도 «주택공시가격 … §164⑦»로 적는다 | 화면에는 안 보인다(⑧이 같은 게이트로 먼저 막는다). API를 직접 부를 때만 보인다 | **Q-2 (a)** 경로로 가른다 — 겸용은 단독 문장, 일반은 두 종류를 함께 적는 문장 | ⑫ 1파일 |
| L-3 | 이월과세 «공동주택 최초고시 전 취득»(APD)을 골라도 패널 라디오는 «단독·다가구», 배지 «§164 ⑦», 라벨 «최초 고시 개별주택가격» | 입력 패널이 ⑧ 메시지(공동주택·§164⑥·⑦)와 어긋난다. 계산값은 같다. ~~결과·PDF 이름~~ — 이월과세 결과에는 PHD 상세가 없어 이름이 나오지 않는다(§7 정정) | **Q-3 (b)** APD면 공동주택으로 본다(단일 정의 `isPhdApartment`) + 패널 라디오 숨김 | lib/calc 1 · ⑤ 2 · ⑧ 1 |

엔진·④·⑬·⑭·계산값은 세 건 모두 바뀌지 않는다.

---

## 1. 현행 실측 (master `b476b8c42`)

throwaway probe(`__tests__/zz-*.test.tsx`, 실행 후 삭제 · `git status` 깨끗함 확인)와 코드 판독으로 확인했다.

### L-1 §164⑤ 확인란

| 항목 | 근거 | 확인 |
|---|---|---|
| 확인란이 보이는 조건 | `PreHousingDisclosureSection.tsx:252` — 보조 모드(`assist`) && `phdAssistNeeds164_5`(취득일·최초 고시일 중 하나라도 연도 ≤2000, `phd-converted-housing-price.ts:72-74`) | 코드 |
| 확인란이 막는 것 | `phd-converted-housing-price.ts:126-127` — 미확인이면 `blocked: "needs_164_5_confirm"` → 채우기 버튼 꺼짐 | 코드 |
| 칸 변경 시 patch | 취득시 건물 기준시가 `:307` `onChange({ phdBuildingStdPriceAtAcq: v })` · 최초 고시 시점 `:318` · 최초 고시일 `:162` — 셋 다 확인란을 건드리지 않는다 | **probe**: 1995 취득 · 확인 true · 취득시 건물 기준시가 20,000,000 → 21,000,000 입력 → patch `{"phdBuildingStdPriceAtAcq":"21000000"}` (확인란 해제 없음) |
| 칸별 계산기 결과 | 칸별 [건물 기준시가 계산] 결과도 같은 콜백(`ThreePointStandardPriceInput.tsx:305·334` `onBuildingStdPriceChange`)으로 들어온다 — 손 입력과 구분되지 않는다 | 코드 |
| 상가 선례 | `lib/calc/building-std-batch-apply.ts:121-130` `buildAcqBuildingStdEditPatch` — 취득시 건물 기준시가를 사용자가 고치면 `cbAcqBuildingStdBy164_5`를 **같은 patch에서** 푼다(useEffect 미러링 아님) | 코드 |
| 영향 범위 | 확인란은 폼 전용(④·⑧·⑫ 미전송·미요구 — 상위 계획서 §9.2 Q-4 (b) ①②③). 채운 뒤의 «취득시 기준시가» 값에는 영향이 없다. 결함은 «확인하지 않은 값으로 버튼이 켜진다» 하나다 | 코드 |

### L-2 서버 Zod 메시지

| 항목 | 근거 | 확인 |
|---|---|---|
| 문장 | `lib/api/transfer-tax-schema-refines.ts:208-209` «…취득당시 주택공시가격이 고시되어 있어 3-시점 환산(§164⑦) 대상이 아닙니다» — 일반(`data.preHousingDisclosure`)·겸용(`data.mixedUse.preHousingDisclosure`) 공용(`:196-198`) | 코드 |
| 주택 종류 전송 | 없음 — `phdHousingType`은 표시 축이라 페이로드에 싣지 않는다(`lib/calc/phd-housing-term.ts:9-11`) | 코드 |
| 화면에 보이는가 | 보이지 않는다(코드 판독). ⑧이 같은 `isPhdEligible`로 먼저 막는다 — 일반 `transfer-tax-validate-acquisition.ts:529` · 이월과세 `transfer-tax-validate-carryover-asset.ts:102·113` · 겸용 `transfer-tax-validate-mixed-use-asset.ts:274`. **API 직접 호출에서만 보인다** | 코드 |
| 이 문장을 단언하는 테스트 | 0건 (`grep "취득당시 주택공시가격이 고시되어 있어"` → `__tests__`·`e2e` 0) | grep |

### L-3 이월과세 APD 주택 종류

| 항목 | 근거 | 확인 |
|---|---|---|
| 환산 방식 3종 | `CarryoverEstimationSection.tsx:33-52` — `general` · `phd` «개별주택가격 미공시 §164⑦» · `apd` «공동주택 최초고시 전 취득» | 코드 |
| phd·apd 계산 차이 | 없다. ④는 둘 다 `preHousingDisclosure` 경로(`transfer-tax-api-carryover.ts:40-41` · `phd-toggle-scope.ts:103`) | 코드 |
| 패널 | 두 모드 모두 같은 `PreHousingDisclosureSection`을 그린다(`CarryoverEstimationSection.tsx:185-208`·`:211-230`). 패널 주택 종류 = `asset.phdHousingType ?? "individual"`(`PreHousingDisclosureSection.tsx:78`), 기본값 `"individual"`(`calc-wizard-asset-factory.ts:232`) | 코드 |
| APD 화면 | — | **probe**: 이월과세 · `estimationMode: "apd"` · `phdHousingType` 기본값 → 체크된 라디오 `carryoverEstimationMode=apd` · `housingType=individual` · 배지 «소득세법 시행령 §164 ⑦» · 라벨 «최초 고시 개별주택가격» |
| ⑧ | APD는 항상 공동주택 문장(`transfer-tax-validate-carryover-asset.ts:115` `phdAcqDisclosedPriceName(true)`·`phdClause(true)`) · 필수 칸 문장도 «최초공시 공동주택가격»·«양도시 공동주택가격»(`:117`·`:120`). PHD는 적용 불가 문장만 라디오를 따르고(`:103`) 필수 칸 문장은 «개별주택가격» 고정(`:105`·`:108`) | 코드 · 기존 anchor `phd-fill-164-6-apartment.anchor.test.ts:132` |
| 결과·PDF | `isPhdApartment(asset)` = `phdHousingType === "apartment"`(`phd-housing-term.ts:20-22`) → `TransferTaxResultView.tsx:136·524`(PDF `inputData.phdApartment`도 여기서) | **probe**: 위 APD 자산 `isPhdApartment` → `false`. ~~⇒ 결과 이름 «환산 개별주택가격»~~ — **정정(Do 실측)**: 이월과세 결과는 `carryoverTaxationDetail`만 있고 `preHousingDisclosureDetail`이 없어(④는 `preHousingDisclosure`를 싣는다) 결과 화면·PDF에 PHD 머리글·«환산 …가격» 이름이 나오지 않는다. 결과 층의 어긋남은 없었다 |

---

## 2. 결정 사항

### Q-1 — L-1 확인란을 언제 푸는가

| 안 | 내용 | 변경 | 남는 것 |
|---|---|---|---|
| **★(a)** | 보조 모드에서 확인이 켜져 있을 때 **취득시 건물 기준시가 · 최초 고시 시점 건물 기준시가 · 최초 고시일**을 바꾸면 같은 patch에 `phdAssistBuildingStdBy164_5: false`를 싣는다 — 상가 `buildAcqBuildingStdEditPatch`와 같은 방식 | `PreHousingDisclosureSection.tsx` 3곳 (+ 순수 helper 1개) | ① 기본정보의 **취득일**만 바꾸면 풀리지 않는다(다른 컴포넌트의 칸). 이때도 건물 기준시가 값은 옛 연도 값이라 사용자가 칸을 다시 계산해야 하고, 그 순간 풀린다 |
| (b) | (a) + 취득일 칸 변경도 풀기 | (a) + 자산 기본정보 날짜 칸 onChange | 보조 전용 폼 필드를 공용 날짜 칸이 알아야 한다 |
| (c) | 확인을 boolean 대신 «확인한 시점의 값 묶음»(취득일·최초 고시일·두 건물 기준시가) 문자열로 저장하고, 현재 값과 같을 때만 확인으로 본다 | ①②③ 타입·기본값·migrate + 술어 + 칩 | 어디서 바뀌어도 풀린다. 옛 세션의 `true`는 미확인이 된다 |

공통: 칸별 계산기 결과도 같은 콜백이라 **계산 → 확인** 순서가 된다(확인 → 계산이면 계산 순간 풀린다). 칩 설명을 «확인해야 계산해 채우기 버튼이 켜집니다 · 건물 기준시가나 최초 고시일을 바꾸면 다시 확인합니다»로 바꾼다.

### Q-2 — L-2 서버 메시지

| 안 | 내용 | 변경 | 비고 |
|---|---|---|---|
| **★(a)** | 경로로 가른다. 겸용(`mixedUse.preHousingDisclosure`) → «…취득당시 개별주택가격이 고시되어 있어 3-시점 환산(§164⑦) 대상이 아닙니다»(겸용 = 단독). 일반 → «…취득당시 주택가격(개별주택가격 또는 공동주택가격 — 국세청장이 고시한 기준시가 포함)이 고시되어 있어 3-시점 환산(단독·다가구 §164⑦ · 공동주택 §164⑥·⑦) 대상이 아닙니다» | `transfer-tax-schema-refines.ts` 1곳 | 주택 종류를 보내지 않아도 틀린 단정이 없어진다. 서버 문장은 ⑧ 문장과 글자가 같을 필요가 없다(화면에는 ⑧이 보인다) |
| (b) | `phdHousingType`을 페이로드에 싣고(④·⑫ optional enum) 서버가 `phdClause`로 가른다 | ④·⑫ + 14지점 점검 | 메시지 하나 때문에 표시 축 필드를 전송 축으로 옮긴다(`phd-housing-term.ts:9-11` 규약과 충돌) |
| (c) | 현행 유지 · 한계로 남김 | 0 | — |

### Q-3 — L-3 이월과세 PHD·APD 주택 종류

| 안 | 내용 | 변경 | 남는 것 |
|---|---|---|---|
| (a) | **방식이 종류를 정한다** — APD = 공동주택, PHD = 단독·다가구. 이월과세 패널은 라디오를 숨긴다. `isPhdApartment`가 이월과세 PHD·APD면 방식으로 답한다 | lib/calc 1 · ⑤ 2 · ⑧ 1 | 지금 «PHD + 패널 라디오 공동주택»으로 저장된 입력은 «단독·다가구»로 보이게 된다(계산값은 같다) — 사용자가 APD로 다시 골라야 한다 |
| **★(b)** | **APD만 공동주택으로 고정**. PHD는 현행대로 패널 라디오를 따른다(공동주택도 고를 수 있다). APD 패널은 라디오를 숨긴다. `isPhdApartment`가 이월과세 APD면 `true` | lib/calc 1 · ⑤ 2 · ⑧ 1 | PHD 옵션 이름 «개별주택가격 미공시 §164⑦»과 패널의 «공동주택» 선택이 함께 있을 수 있다(현행과 같다). PHD ⑧ 필수 칸 문장(`:105`·`:108`)은 라디오를 따르게 고친다 |
| (c) | PHD·APD를 하나로 합치고 패널 라디오로 종류를 고른다 | ⑤ 옵션 삭제 · ①②③ migrate(apd → phd + apartment) · ⑧ 분기 통합 · 기존 테스트 | 가장 깔끔하지만 범위가 크다 |

★(b)를 권하는 이유: 지적된 결함(APD인데 단독으로 보인다)을 고치면서 기존 저장값의 표시를 하나도 바꾸지 않는다. (a)는 PHD + 공동주택 저장값의 표시를 바꾼다.

---

## 3. 설계 (권장안 Q-1 (a) · Q-2 (a) · Q-3 (b) 기준)

### 3.1 L-1 — `PreHousingDisclosureSection.tsx`

- 순수 helper(같은 파일 또는 `lib/calc/phd-converted-housing-price.ts`): `phdAssist164_5EditPatch(patch, asset)` — `asset.phdAssistBuildingStdBy164_5`가 true면 `{ ...patch, phdAssistBuildingStdBy164_5: false }`, 아니면 `patch`. 상가 `buildAcqBuildingStdEditPatch`와 같은 꼴.
- 적용: `:162` 최초 고시일 · `:307` 취득시 건물 기준시가 · `:318` 최초 고시 시점 건물 기준시가. **보조 모드에서만** 싣는다(환산 모드는 이 필드를 쓰지 않는다 — 환산 모드 patch는 바이트 동일).
- 같은 값을 다시 넣는 경우(onChange가 같은 문자열로 불리는 경우)도 푼다 — 콜백이 값 비교를 하지 않는 상가 선례와 같다. 확인 필요(V-1): 칸 포커스 이동·포맷 재계산만으로 onChange가 불리는지.
- 칩 설명 문구 변경(§2 Q-1 공통).

### 3.2 L-2 — `transfer-tax-schema-refines.ts:196-212`

- `phdFirstDate`를 고르는 곳에서 어느 경로인지(`data.mixedUse?.preHousingDisclosure` 쪽이면 겸용)를 함께 잡아 메시지를 가른다. 판정·path는 그대로.
- 문장은 §2 Q-2 (a). «의제취득일 1985-01-01 반영»·«이월과세는 증여자 취득일» 앞부분은 그대로 둔다.

### 3.3 L-3 — 주택 종류 단일 정의

| 층 | 파일 | 변경 |
|---|---|---|
| 단일 정의 | `lib/calc/phd-housing-term.ts` `isPhdApartment` | 이월과세 APD(`acquisitionCause === "carryover_gift"` && `carryover.useEstimatedAcquisition` && `carryover.estimationMode === "apd"`)면 `true`, 아니면 종전대로 `phdHousingType === "apartment"`. 인자 타입을 `Pick<AssetForm, "phdHousingType" \| "acquisitionCause" \| "carryover">`로 넓힌다. 확인 필요(V-2): 모든 호출부(결과 3·⑤ 4·⑧ 2·PDF 경유 1)가 이 세 키를 가진 객체를 넘기는가 — `tsc`로 확인. 일반건물 파트 이월과세 잔재(`partCarryover`)·컴패니언 잔재는 ④가 PHD를 싣지 않으므로(`phd-toggle-scope.ts:95-103`) 결과에 PHD 상세가 없어 표시 영향이 없다 — 판정에 `carryoverPhdMode`를 쓸지는 V-2와 함께 정한다 |
| ⑤ 패널 | `PreHousingDisclosureSection.tsx:78` | `housingType`을 `isPhdApartment(asset) ? "apartment" : "individual"`로 읽는다. 새 prop `housingTypeFixed?: boolean` — true면 라디오(`:131-138`)를 그리지 않는다. 다른 호출부(일반 PHD·보조 카드·이월과세 PHD)는 prop을 넘기지 않아 바이트 동일 |
| ⑤ 호출부 | `CarryoverEstimationSection.tsx:217` (APD) | `housingTypeFixed` 전달. PHD 블록(`:192`)은 그대로 |
| ⑧ | `transfer-tax-validate-carryover-asset.ts:105·108` (PHD 필수 칸) | «최초 고시 개별주택가격»·«양도시 개별주택가격» → 라디오를 따른다(`phdDisclosedPriceName(isPhdApartment(asset))`). APD 문장(`:115·117·120`)은 그대로 |
| ⑦ 결과·PDF | 변경 없음 | 이월과세는 PHD 상세가 없어 이름이 갈릴 곳이 없다(§7 정정). 엔진이 나중에 내면 `isPhdApartment`를 이미 읽으므로 APD는 «환산 공동주택가격»이 된다 — anchor가 «PHD 상세 없음»을 고정해 그때 알린다 |

store에는 쓰지 않는다 — APD 선택 시 `phdHousingType`을 바꿔 쓰는 onChange 동기화 대신 **읽는 쪽 단일 정의**로 처리한다(useEffect 미러링 없음 · 3중 패턴: ⑤ 패널·⑧·⑦이 같은 함수). 저장값 `phdHousingType`은 그대로 남아, 사용자가 방식을 PHD로 바꾸면 종전 라디오 값이 돌아온다.

---

## 4. 검증 계획

| # | 단계 | 확인 |
|---|---|---|
| 1 | Pre-Do anchor(실패 확인 먼저) | L-1: 보조·확인 true에서 세 칸 변경 → patch에 `phdAssistBuildingStdBy164_5: false` · 환산 모드 patch 불변. L-2: `propertySchema.safeParse` 일반·겸용 각 1건 → 문장. L-3: 이월과세 APD → `checkedRadioValue` 없음(라디오 숨김) · 배지 «§164⑥·⑦» · `isPhdApartment` true · 결과 머리글 «환산 공동주택가격» · 이월과세 PHD + 라디오 단독/공동 → 종전 그대로 |
| 2 | 기존 단언 | `phd-fill-164-6-apartment.anchor.test.ts`·`-ui.anchor.test.tsx`·`phd-input-term-unify`·`phd-result-housing-term` 통과 유지. 바뀌는 단언은 L-3 PHD 필수 칸 문장(검색 후 목록화 — 확인 필요 V-3) |
| 3 | 뮤테이션 | 해제 patch 제거 · 보조 모드 조건 제거(환산 모드에서도 해제) · 겸용 분기 제거 · `isPhdApartment` APD 분기 제거 · `housingTypeFixed` 무시 — 전부 KILLED (cp 백업 · md5 복원) |
| 4 | 범위 테스트 | `npx vitest run __tests__/calc/ __tests__/components/` · `npm run test:transfer` · `npx tsc --noEmit` |
| 5 | 브라우저 | Playwright: 이월과세 APD 입력 → 패널·⑧ → 결과 이름. 보조 카드 1995 취득 확인 → 칸 수정 → 버튼 꺼짐. 미수행 시 명시 |

---

## 5. 미검증 · 레지스터

| # | 내용 | 상태 |
|---|---|---|
| V-1 | 칸 포커스 이동·콤마 포맷만으로 `onBuildingStdPriceAtAcqChange`가 불리는가(불리면 확인 직후 풀릴 수 있다) | ✅ 불리지 않는다 — 마운트·focus·blur에서 patch 0건(anchor L-1 첫 케이스) |
| V-2 | `isPhdApartment` 인자 확장 시 모든 호출부 타입 통과 · 결과 화면이 넘기는 `resolvedAsset`에 `carryover`가 있는가 | ✅ `acquisitionCause`·`carryover`를 optional Pick으로 넓혀 `tsc` 0건. 결과 화면은 이월과세에 PHD 상세가 없어 무관(§7) |
| V-3 | PHD 필수 칸 문장(«최초 고시 개별주택가격을 입력하세요» 등)을 단언하는 기존 테스트 목록 | ✅ 0건(`__tests__`·`e2e` grep) — 단독 문장은 바이트 그대로라 바뀌는 단언도 없다 |
| Q-1 | 확인란 해제 범위 | ✅ (a) 사용자 결정 2026-10-26 |
| Q-2 | 서버 메시지 | ✅ (a) 사용자 결정 2026-10-26 |
| Q-3 | 이월과세 PHD·APD 주택 종류 | ✅ (b) 사용자 결정 2026-10-26 |

## 6. 범위 밖

- 엔진·④·⑬·⑭·계산값.
- 겸용주택 PHD(단독 고정 — 상위 계획서 §9.5-1).
- 일반 PHD 토글(취득원인 매매)의 라디오·문구 — 상위 계획서 §9.2 그대로.
- 남은 한계 4번(브라우저 수동 확인 미수행)은 이 계획의 검증 5단계에서 함께 수행한다.


---

## 7. 구현 결과 (2026-10-26)

사용자 결정: **Q-1 (a) · Q-2 (a) · Q-3 (b)** (권장안 전부).

### 7.1 바뀐 것

| 결정 | 파일 | 내용 |
|---|---|---|
| Q-1 (a) | `lib/calc/phd-converted-housing-price.ts` | `phdAssist164_5EditPatch(patch, asset)` — 확인이 켜져 있으면 같은 patch에 `phdAssistBuildingStdBy164_5: false` (상가 `buildAcqBuildingStdEditPatch`와 같은 꼴) |
| Q-1 (a) | `PreHousingDisclosureSection.tsx` | 최초 고시일 · 취득시 건물 기준시가 · 최초 고시 시점 건물 기준시가 onChange가 **보조 모드에서만** 위 helper를 거친다(환산 모드 patch 불변). 칩 설명 «… · 건물 기준시가나 최초 고시일을 바꾸면 다시 확인합니다» |
| Q-2 (a) | `lib/api/transfer-tax-schema-refines.ts` | 겸용(`mixedUse.preHousingDisclosure`) «취득당시 개별주택가격이 고시되어 있어 3-시점 환산(§164⑦) 대상이 아닙니다» · 일반 «취득당시 개별주택가격 또는 공동주택가격(국세청장이 고시한 기준시가 포함)이 고시되어 있어 3-시점 환산(단독·다가구 §164⑦ · 공동주택 §164⑥·⑦) 대상이 아닙니다». 판정·path 불변 |
| Q-3 (b) | `lib/calc/phd-housing-term.ts` | `isPhdApartment` — 이월과세 && 환산 사용 && `estimationMode === "apd"`면 `true`. 인자 타입은 `acquisitionCause`·`carryover`를 optional로 넓혔다(기존 호출부 그대로) |
| Q-3 (b) | `PreHousingDisclosureSection.tsx` | 주택 종류를 `isPhdApartment`로 읽는다 · 새 prop `housingTypeFixed`(true면 라디오를 그리지 않는다) |
| Q-3 (b) | `CarryoverEstimationSection.tsx` | APD 패널에 `housingTypeFixed` 전달. PHD 패널은 그대로 |
| Q-3 (b) ⑧ | `transfer-tax-validate-carryover-asset.ts:105·108` | PHD 필수 칸 문장이 라디오를 따른다 — «최초 고시 공동주택가격»·«양도시 공동주택가격» / 단독은 종전 바이트 그대로 |

엔진·④·⑬·⑭·계산값·저장값(`phdHousingType`) 변경 없음.

### 7.2 정정 — 결과 층에는 어긋남이 없었다

계획 §1 L-3의 «결과 이름 «환산 개별주택가격»»은 `isPhdApartment` probe에서 **추론**한 것이었다. Do에서 폼 → ④ → route → 엔진 → `TransferTaxResultView`를 실측하니 이월과세 결과는 `carryoverTaxationDetail`만 있고 `preHousingDisclosureDetail`이 없다(④는 `preHousingDisclosure`를 싣는다) — 결과 화면·PDF에 PHD 머리글·«환산 …가격» 이름이 나오지 않는다. 그래서 L-3의 실제 어긋남은 **입력 패널 ↔ ⑧** 둘뿐이었다. anchor가 «이월과세 결과에 PHD 상세 없음»을 고정해, 엔진이 나중에 그것을 내면 깨져 알린다.

### 7.3 검증

- anchor 신규 `__tests__/calc/phd-residual-limits.anchor.test.tsx` 18건 — Pre-Do에서 9건 실패 확인 후 구현 → 18/18 통과. L-1 6(V-1 포함) · L-2 2(route POST) · L-3 8 · 결과 2.
- 뮤테이션 16/16 KILLED (cp 백업 · md5 복원 확인): helper 해제 · 보조 모드 조건 · 세 칸 각각 · 칩 문구 · 서버 겸용 판정 true/false · `isPhdApartment` APD·환산 사용·이월과세 조건 · `housingTypeFixed` 무시 · APD prop 누락 · 패널 종류 원복 · ⑧ 두 문장.
- 범위 테스트 `__tests__/calc __tests__/components __tests__/api` 1678파일 · 19806 passed · `npx tsc --noEmit` 0건.
- **브라우저(Playwright)** `e2e/phd-residual-limits.spec.ts` 2건 통과 — RL-1 1995 취득 보조 카드: 확인 상태 버튼 켜짐 → 취득시 건물 기준시가 수정 → 버튼 꺼짐·저장값 false → 다시 확인 → 켜짐. RL-2 이월과세 APD: 라디오 0개 · 배지 §164⑥·⑦ · 라벨 공동주택 → PHD로 바꾸면 라디오 2개(단독 선택) · 배지 §164 ⑦ · 저장값 `individual` 유지. 수정 전 코드로 되돌려 돌리면 두 건 모두 실패함을 확인했다(md5 원복).
