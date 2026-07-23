# 중과 경과조치(§167의3①12의2) 후속 작업 진행 계획서

- 작성일: 2026-07-24 · rev.2 (13단계 자가검증: F1 설계 정정 — 다건은 본질적 per-property, form-global 복제 프레이밍 폐기·2차 티켓 삭제. 전 인용 file:line 실측 일치)
- 배경: PR#757·#758로 나·다목 경과조치 엔진·UI·E2E 완료. 잔여 OPEN 항목을 우선순위화하여 진행.
- 범위: 경과조치 직접 후속 2건(F1·F2) + 세션 전반 잔여 OPEN 3건(F3~F5). 우선순위·독립성 기준 순차/선택 진행.

## 우선순위 요약

| # | 항목 | 심각도 | 성격 | 독립성 |
|---|---|---|---|---|
| **F1** | 다자산(묶음양도) gracePeriod 미연결 | 🔴 silent 오세액 | 배관 갭 | 독립 |
| F2 | 기간 만료일 초일불산입(민법 §157) | 🟡 경계 1일 | 유권해석+엔진 | 독립 |
| F3 | §155⑳ 시나리오 A 조기반환 갭 | 🟠 | 엔진 판정 | 독립(별 도메인) |
| F4 | 3시점 모달 연면적 round2 미적용(홈택스 938원 차이) | 🟡 표시/정밀 | 환산 | 독립 |
| F5 | ReductionPhdInput dual-truth 해소 | 🟠 | 리팩터 | 독립 |

각 항목 독립적 → 개별 PR 권장. F1 최우선(과세 정확성 직접 영향).

---

## F1 — 다자산 묶음양도 gracePeriod 연결 🔴

### 실측 갭 (2026-07-24)
단건(`app/api/calc/transfer/route.ts:198`)은 `gracePeriod: mapGracePeriodToEngine(data.gracePeriod)`로 완비. **다건 경로는 전 구간 gracePeriod 미전달**:

| 지점 | 상태 |
|---|---|
| ①②③ store/initial/normalize | ✅ `PropertyItem.form`(`multi-transfer-tax-store.ts:15`) = `TransferFormData` → PR#757의 gracePeriod 필드 그대로 보유. 각 property가 자기 form.gracePeriod 소유 |
| ⑫ Zod `propertyBaseShape:99` gracePeriod | ✅ **이미 존재** (`propertySchema:498`·`propertyItemSchema:726` 둘 다 `...propertyBaseShape` spread — 통과) |
| ⑬ 클라이언트 `buildPropertyPayload`(`multi-transfer-tax-api.ts:84` return) | 🔴 housesPayload는 빌드(:32~62)하나 gracePeriod **미포함** |
| ⑭ Route `multi/route.ts:160` | 🔴 `mapHousesToEngine(p.houses)`만, `mapGracePeriodToEngine(p.gracePeriod)` **없음** |

→ 다자산 묶음양도에서 중과 유예/경과조치가 **가목 포함 전면 미작동**(나·다목 이전부터 존재하던 갭). 스키마는 통과하나 클라가 안 보내고 route가 엔진에 안 넣어 침묵 strip.

### 설계 — 다건은 **본질적으로 per-property** (13단계 검증 정정)
실측 데이터 흐름(`multi-transfer-tax-api.ts:240~243`):
```
callMultiTransferTaxAPI(multiForm, properties: PropertyItem[])
  → properties.map(p => ({ propertyId, propertyLabel, ...buildPropertyPayload(p.form) }))
```
각 `PropertyItem.form`은 **자산별 개별 TransferFormData**(그 자산의 단건 마법사 세션에서 Step4 gracePeriod까지 입력·저장됨). 즉 gracePeriod는 **native per-property** — "form-global 하나를 복제"하는 구조가 아니다. 소재지(regionCode)도 자산별(`primary.regionCode`)이라 `transitionExemptionMonths`가 자산별 정확 판정. **per-property vs form-global 트레이드오프·2차 티켓은 존재하지 않음**(rev.1 오분석 폐기).

### 배관 — 하드 필수 ⑬⑭ 2점 (①②③⑫ 완료)
- ⑬ `buildPropertyPayload`(`multi-transfer-tax-api.ts:84` return 객체): 단건 클라(`transfer-tax-api.ts:448`)와 **동일 코드** 추가 — `...(housesPayload && form.gracePeriod ? { gracePeriod: form.gracePeriod } : {})`. buildPropertyPayload가 housesPayload(:32~62)를 이미 빌드하므로 게이트 그대로 재사용. Date는 string 전달(route 변환).
- ⑭ `multi/route.ts:160` 부근: `gracePeriod: mapGracePeriodToEngine(p.gracePeriod)` 추가(단건 route:198과 동일 공용 헬퍼 `transfer-route-multi-house.ts:120`).

### ⑧ validate — 확인 후 조건부 (하드 필수 아님)
`multi-transfer-tax-validate.ts`(171줄)의 `validateMultiSupportedMode`(:50)는 per-property 지원모드 검증만·gracePeriod 무검증. 단, 각 `PropertyItem.form`은 **단건 마법사에서 완성·저장된 계산**이라 저장 시점에 단건 validate(`transfer-tax-validate.ts:182` 나목 허가신청일 필수)를 이미 통과했을 가능성. → 다건에서 gracePeriod 재검증이 필요한지 실측(저장 경로가 단건 validate를 강제하는지) 후 필요 시 per-property mirror. **불필요하면 추가 안 함**(과잉 검증 지양).

### Anchor
- `__tests__/tax-engine/` 다자산 gracePeriod 왕복: 2자산 중 1자산이 나목 경과조치 충족(강남 11680) → 그 자산만 배제, 다른 자산(용인기흥 41463=null 부적용) 중과 유지. 자산별 form.gracePeriod 독립 판정 검증.
- 배관 테스트: `buildPropertyPayload(form with gracePeriod+houses)` → payload에 gracePeriod 포함 → route `mapGracePeriodToEngine` → 엔진 input 도달(grep+유닛).

### 리스크
- **낮음**: 단건과 동일 코드·게이트 재사용. per-property가 native라 자산별 계약일 상이도 자연 정확(rev.1이 우려한 form-global 부정확 케이스 자체가 없음). 다건 미지원 모드(부담부증여·재개발·겸용 등)는 housing+houses[] 조합이 아니라 housesPayload=undefined → gracePeriod 게이트로 자동 미전송(무해).

---

## F2 — 기간 만료일 초일불산입 유권해석 🟡

현행 `checkGracePeriodExemption`는 date-fns `addMonths`(응당일 = 민법 §160② 역월 만료). "계약체결일부터 4개월"에 민법 §157 초일불산입 적용 시 만료일이 1일 달라질 수 있음(예: 5-31 계약 → 응당일 9-30 vs 초일불산입 만료 계산).

- **작업**: 국세청 유권해석·집행기준 실측(KoreanLaw decisions / 소득세 집행기준)으로 "계약일부터 N개월" 기산 방식 확정 → addMonths 유지 or 초일불산입 보정.
- **경계 anchor**: M9(다목 계약+4M 경계) 월말 케이스 추가.
- **독립**: F1과 무관, 소규모. 유권해석 확보 안 되면 현행 유지(응당일이 통상 실무).

---

## F3 — §155⑳ 시나리오 A 조기반환 갭 🟠

앞선 §155⑳ 작업(PR#755) 계획서 §9 기록: 시나리오 A(거주주택 양도·임대주택 주택수 제외)에서 eligibility 판정 **전** 전액 비과세 조기반환 경로 존재 가능(시나리오 B는 PR#755에서 게이트 추가). A도 동일 클래스 갭인지 실측 후 판정.

- **작업**: `transfer-tax.ts` STEP 1a 조기반환이 시나리오 A eligibility(임대주택 요건 미충족 시)를 우회하는지 실측 → 필요 시 B와 동일 `isPrhpScenarioA` 게이트.
- **참조**: [[project_transfer_rental_housing_prhp_161_bypass]] C-2 OPEN.
- **독립**: 경과조치와 무관 도메인.

---

## F4 — 3시점 모달 연면적 round2 미적용 🟡

건물기준시가 3시점 환산 모달에서 연면적에 `round2()` 미적용 → 홈택스 공시값과 938원 차이(기존 식별). [[project_building_std_lookup_year_gate_and_collective_unit]] 계열.

- **작업**: 3시점 환산 모달 연면적 곱셈 전 `area-utils.round2()` 적용(표시=계산 일치 강제). 홈택스 anchor로 938원 차이 해소 확인.
- **주의**: 면적 안분 잔액 흡수 규칙([[feedback_area_apportion_residual_absorption]]) 준수.
- **독립**: 환산 도메인.

---

## F5 — ReductionPhdInput dual-truth 해소 🟠

[[project_apartment_pre_disclosure]] OPEN: 감면 조문 PHD 환산 입력(`ReductionPhdInput`)이 자산-수준 PHD와 별도 소스로 dual-truth. §155⑳ 기준시가 연동(PR#756)에서 쓴 **공유 predicate + 소스 ternary 패턴**([[project_transfer_phrp_stdprice_link_dedup]]) 유추 적용 검토.

- **작업**: ReductionPhdInput과 자산-수준 PHD 필드의 중복 입력 지점 실측 → 단일 소스화(연동 predicate).
- **독립**: 감면 도메인.

---

## 진행 순서 권고

```
1. F1 (다자산 gracePeriod) — 최우선, 과세 정확성 직접. 배관 ⑬⑭ + anchor → 독립 PR.
2. F2 (초일불산입) — F1 후 소규모. 유권해석 확보 시.
3. F3~F5 — 각 독립 도메인, 사용자 우선순위에 따라 선택 진행(경과조치와 무관).
```

F1만 경과조치와 직접 연관(같은 gracePeriod 배관). F2는 경과조치 정밀도. F3~F5는 별도 도메인이라 "경과조치 후속"보다는 세션 잔여 OPEN 정리 성격 — 사용자 우선순위 확인 후 진행.
