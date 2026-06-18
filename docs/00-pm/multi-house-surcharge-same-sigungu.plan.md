# 다주택 중과 — 인구감소지역 세컨드홈 "동일 시·군·구" 요건 구현 계획서

> 소령 §167의3①12 **다목 2호 / 라목 2호** — "해당 주택 취득 전에 보유한 주택과 동일한 시·군·구에 소재하는 주택이 아닐 것" 미구현 갭 보완.
> 선행: [[project_transfer_multi_house_gaps]] (#0~#4·#2a·#2b·§154① 완결) 잔여 1건.
> 작성일 2026-06-18. 모든 file:line·법령 본문·데이터 구조는 실측 확인 완료(추정 없음).

---

## 1. 배경 & 문제 정의

인구감소지역 세컨드홈 특례(2026.1.1~)는 인구감소지역·관심지역 소재 주택을 다주택 중과 주택 수 산정에서 **배제**하는 제도다. 현재 엔진(`lib/tax-engine/multi-house-surcharge-count.ts:488-507`)은 이 특례의 **3개 요건 중 가액 한도(다목 3호·라목 3호)만 검증**하고 있고, **"동일 시·군·구가 아닐 것"(다목 2호·라목 2호)을 검증하지 않는다.**

결과: 세컨드홈 후보 주택이 **취득 전부터 보유하던 같은 시·군·구의 주택과 함께 있어도 가액만 충족하면 배제 처리** → 주택 수가 실제보다 적게 산정되어 **중과세 과소적용(과소과세) 방향의 충실도 갭**.

"현재 광범위 과세오류"는 아님 — 트리거(인구감소지역 세컨드홈 + 동일 시군구 보유) 조합이 좁고 2026.1.1 이후 취득분에만 발생. **법령 정합(충실도) 갭**이다.

---

## 2. 법령 근거 (KoreanLaw MCP 실측 — 소득세법 시행령 MST 286211, 시행 2026.5.22)

§167의3①12 — "3개 이상 소유 1세대가 소유하는 주택으로서 다음 각 호에 해당하지 않는 주택"(제12호 해당 주택은 **주택 수 계산 시 산입하지 않음**) 중:

**다목** (2026년 1월 1일 이후 취득):
1. 취득 당시 **인구감소지역**(지방분권균형발전법 §2 12호) 소재. 단, 수도권(접경지역 아닌 지역) 또는 광역시(군 제외) 소재 주택은 제외.
2. **해당 주택 취득 전에 보유한 주택**(취득 전 조합원입주권·분양권 보유 시 그를 통해 공급하는 주택)과 **동일한 시·군·구에 소재하는 주택이 아닐 것** ← **미구현 갭**
3. 주택+부속토지 기준시가 합계가 취득일 현재 **4억원(수도권 밖 인구감소지역 9억원)** 이하.

**라목** (2026년 1월 1일 이후 취득):
1. 취득 당시 수도권 밖 + **인구감소관심지역**(§2 12호의2) 소재. 단, 광역시(군 제외) 제외.
2. 다목 2호와 **동일 문구** — 동일 시·군·구 아닐 것 ← **미구현 갭**
3. 기준시가 합계 취득일 현재 **4억원** 이하.

> ⚠️ 법문상 비교 기준은 **"해당 주택 취득 전에 보유한 주택"** — 세컨드홈 후보의 취득일 **이전(또는 동일)**에 이미 보유 중이던 주택만 비교 대상. 후보 취득 **이후** 취득한 동일 시군구 주택은 비교 대상 아님.
> ⚠️ 입주권/분양권을 취득 전부터 보유한 경우, **그 권리로 공급되는 주택의 시·군·구**가 비교 대상(데이터 부재 — §8 참조).

---

## 3. 현재 상태 (실측 file:line)

| 항목 | 위치 | 현황 |
|---|---|---|
| 배제 로직 | `multi-house-surcharge-count.ts:488-507` | 가액 한도만 검증, 시군구 비교 없음 |
| 인구감소 판정 | 동 491 `house.isPopulationDeclineArea ?? classifyPopulationDeclineArea(regionCode)` | boolean override 우선, 없으면 regionCode 자동판정 |
| 시군구 추출 헬퍼 | `data/population-decline-areas.ts:120` | `regionCode.substring(0, 5)` 이미 사용 중 |
| regionCode 필드 | `types/multi-house-surcharge.types.ts:59` | HouseInfo에 존재(법정동 10자리, 앞 5=시군구) |
| regionCode 주입 | `components/calc/transfer/CompanionAssetCard.tsx:244` | AddressSearch PNU 앞 10자리 자동 도출(직접 입력 불가) |
| 보유주택 배열 | `types/...types.ts:258` `houses: HouseInfo[]` | 세대 전체 주택 — 비교 대상 확보 가능 |
| 취득일 | `HouseInfo.acquisitionDate` (L34) | "취득 전 보유" 판정 가능 |

**핵심 이점**: 비교에 필요한 데이터(`regionCode`·`acquisitionDate`·`houses[]`)가 **모두 이미 존재** → 신규 입력 필드 0개(입주권/분양권 제외 시). 14개 동기화 지점 부담이 매우 작고 **순수 엔진 로직 추가**가 작업의 거의 전부.

---

## 4. 설계

### 4.1 시군구 비교 헬퍼 (신규)

`data/population-decline-areas.ts`에 추가:

```ts
/** 시군구 코드(앞 5자리) 추출. 없으면 null. */
export function toSigunguCode(regionCode?: string): string | null {
  if (!regionCode || regionCode.length < 5) return null;
  return regionCode.substring(0, 5);
}
```

### 4.2 배제 로직 확장 (`multi-house-surcharge-count.ts:492` 분기 내)

```ts
if (isPopDecline && house.isSecondHomeRegistered) {
  // (기존) 가액 한도
  if (house.officialPrice <= popCap) {
    // (신규) 다목 2호·라목 2호 — 취득 전 보유주택과 동일 시군구 검증
    const sameSigunguResult = checkSameSigunguPriorHouse(house, allHouses);
    if (sameSigunguResult.hasSameSigungu) {
      // 동일 시군구 보유주택 존재 → 특례 미적용 → 일반 산입(fall through, count++)
      warnings? // 산입 사유는 별도 추적 불요 (count++만)
    } else {
      excluded.push({ houseId, reason: "population_decline_second_home", detail });
      continue;
    }
  }
}
```

판정 함수 (신규, count.ts 내부 또는 헬퍼):

```ts
function checkSameSigunguPriorHouse(
  candidate: HouseInfo,
  allHouses: HouseInfo[],
): { hasSameSigungu: boolean; uncheckable: boolean } {
  const candSgg = toSigunguCode(candidate.regionCode);
  if (!candSgg) return { hasSameSigungu: false, uncheckable: true }; // §4.3 정책
  let uncheckable = false;
  for (const other of allHouses) {
    if (other.id === candidate.id) continue;
    // "취득 전에 보유한 주택" — 후보 취득일 이전(또는 동일)에 취득한 주택만
    if (other.acquisitionDate > candidate.acquisitionDate) continue;
    const otherSgg = toSigunguCode(other.regionCode);
    if (!otherSgg) { uncheckable = true; continue; } // 비교 불가 주택
    if (otherSgg === candSgg) return { hasSameSigungu: true, uncheckable };
  }
  return { hasSameSigungu: false, uncheckable };
}
```

> `allHouses` = `input.houses` 전체(배제 루프 외부에서 전달). 현재 `determineExcludedHouses`가 houses 배열을 순회하므로 원본 배열 참조를 함수에 넘김.

### 4.3 regionCode 누락 처리 정책 (결정 필요 — §7)

- **후보 주택 regionCode 없음**(boolean override `isPopulationDeclineArea=true` 경로): 시군구 비교 불가. **권고 = 가액요건만으로 특례 잠정 적용 + `warnings`에 "동일 시·군·구 요건 미검증(주소 입력 권장)" 추가.** 근거: 동일시군구는 *제한규정*이며 데이터 부재 시 제한 미적용(납세자 유리)이 원칙([[feedback_no_unfavorable_application_without_legal_basis]]). 기존 boolean override 동작 비파괴.
- **비교대상 보유주택 regionCode 없음**: 해당 주택만 비교에서 제외(다른 시군구 간주) + `warnings` 경고.

### 4.4 결과 표시

- 동일 시군구로 **산입**된 경우: 별도 ExcludedHouse 미생성(count++만) → 결과뷰 변화 없음. 단 `warnings`로 "동일 시군구 보유주택 존재 → 세컨드홈 특례 미적용" 노출 권장.
- `MultiHouseSurchargeResult.warnings`(L349) 재사용 — 신규 결과 필드 불요.

---

## 5. 케이스 매트릭스 (anchor 대상)

| # | 시나리오 | 후보 취득일 | 비교 보유주택 | 기대 결과 |
|---|---|---|---|---|
| C1 | 다목 9억↓ + **동일 시군구** 보유주택(취득 전) | 2026.3 | 같은 시군구·2024 취득 | **산입**(특례 배제) ← 현재 버그(잘못 배제) |
| C2 | 다목 9억↓ + 다른 시군구 보유주택 | 2026.3 | 다른 시군구·2024 | 배제(특례 적용) |
| C3 | 다목 + 동일 시군구지만 **취득 후** 취득 | 2026.3 | 같은 시군구·**2026.6** 취득 | 배제(특례 적용 — "취득 전" 아님) |
| C4 | boolean override만(regionCode 無) | 2026.3 | — | 배제 + 경고(미검증) |
| C5 | 후보 regionCode 有 + 비교주택 regionCode 無 | 2026.3 | regionCode 없음 | 배제(간주) + 경고 |
| C6 | 가액 한도 초과 | 2026.3 | — | 산입(기존, 시군구 무관) |
| C7 | 라목 4억↓ + 동일 시군구(취득 전) | 2026.3 | 같은 시군구·2025 | **산입** |
| C8 | 동일 시군구 보유주택이 그 자체로 산정제외(임대 등) | 2026.3 | 같은 시군구·임대주택·2024 | **산입** — 법문 "보유한 주택"은 산정제외 여부 무관 |

> C8 주의: 비교 대상은 "보유한 주택"이지 "산정 산입되는 주택"이 아님. 임대주택 등 다른 사유로 배제되는 주택이라도 동일 시군구면 세컨드홈 특례를 깬다.

---

## 6. 14개 동기화 지점 점검

신규 **입력 필드 0개**(시군구 비교는 기존 `regionCode`·`acquisitionDate` 파생) → 대부분 N/A. (Explore 실측 매핑 기반)

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | N/A — 신규 필드 없음 (regionCode 기존 주입 `CompanionAssetCard.tsx:244`) |
| ② initial | N/A |
| ③ normalize | N/A |
| ④ API 변환 | N/A — `transfer-tax-api-houses.ts:96-98` regionCode 기존 passthrough 확인 |
| ⑤ UI 위젯 | N/A (입력 추가 없음). 단 §7 경고 노출 시 결과뷰만 |
| ⑥ 사이드바 | N/A |
| ⑦ 결과 카드 | 경고 노출 시 `MultiHouseSurchargeDetailCard.tsx` warnings 섹션 확인(기존 표시 경로 재사용) |
| ⑧ validation | **선택** — 세컨드홈 등록인데 후보 regionCode 누락 시 비차단 경고(§7 결정) |
| ⑨⑩⑫ Zod | N/A — `transfer-tax-schema-sub.ts:285-287` 기존 필드로 충분 |
| ⑪ acquisitionDate fallback | N/A |
| ⑬ body spread | N/A |
| ⑭ Route 매핑 | N/A — `transfer-route-multi-house.ts:76-78` passthrough |

→ **순수 엔진 + 테스트가 작업의 95%.** UI/API 변경은 (경고 표시 채택 시) 결과뷰 warnings 1곳뿐.

---

## 7. 결정 필요 사항 (권고안 포함)

1. **regionCode 누락 시 처리** — 권고: **비차단 경고 + 특례 유지**(기존 boolean override 비파괴, 납세자 유리 원칙). 대안: 세컨드홈 등록 시 후보 주택 주소(regionCode) 입력 차단 validation(법령 정확성 강화, but UX 부담·기존 동작 파손).
2. **입주권/분양권 "통해 공급하는 주택" 시군구 비교** — 권고: **이번 범위 제외(Phase 2)**. PresaleRight에 공급주택 시군구 데이터 부재 + 발생 빈도 극히 낮음. 타입 placeholder도 YAGNI로 보류.
3. **동일 시군구 산입 시 경고 노출 여부** — 권고: `warnings`에 추가(투명성). 결과뷰 신규 UI 없이 기존 warnings 경로 재사용.

> 위 3건은 권고대로 진행해도 무방. 이견 시 Do 착수 전 조정.

---

## 8. 범위 밖 (별도/후속)

- **입주권·분양권을 통해 공급하는 주택의 시군구 비교**(다·라목 2호 괄호): 데이터 부재 → Phase 2.
- **"접경지역" 정밀 판정**(다목 1호 단서 — 수도권 중 접경지역은 포함): 현재 regionCode 자동판정/boolean override가 인구감소지역 소재를 전제하므로 이번 갭과 독립. 별도 확인 항목.
- 부칙 양도일 분기(이 특례는 2026.1.1 이후 취득분 전용이라 영향 없음).

---

## 9. Pre-Do Anchor (착수 직후 우선 — [[feedback_pre_anchor_verification]])

`__tests__/tax-engine/multi-house-surcharge/same-sigungu-predo.test.ts`:

- **C1 red→green** 핵심: 다목 세컨드홈 후보(9억↓) + 취득 전 동일 시군구 보유주택 → `effectiveHouseCount`에 **산입**(현재는 잘못 배제되어 count 작음 → red 확보). 시군구 비교 구현 후 green.
- C2(다른 시군구 배제 유지)·C3(취득 후 동일시군구 배제 유지)도 동반.

> Pre-Do에서 C1이 red로 떨어지는지 먼저 실증 → 디자인 환류 후 본 구현. "현행 일치 예상" 가정 금지.

---

## 10. 작업 단계 (Phase)

- **P0** Pre-Do anchor(C1~C3) 작성·red 확인.
- **P1** `toSigunguCode` 헬퍼 + `checkSameSigunguPriorHouse` 추가(`population-decline-areas.ts` / `multi-house-surcharge-count.ts`).
- **P2** 배제 분기(L492-507)에 시군구 검증 삽입. `allHouses` 참조 전달(`determineExcludedHouses` 시그니처 확인).
- **P3** regionCode 누락 정책(§7-1) + warnings(§7-3) 반영.
- **P4** anchor 매트릭스 C1~C8 전수 green. 기존 MH 회귀(특히 인구감소지역 기존 테스트) 영향 확인.
- **P5** `npx tsc --noEmit` 0건 + `npx vitest run __tests__/tax-engine/multi-house-surcharge/` 통과 + 전체 `npm test`.
- **P6**(경고 UI 채택 시) `MultiHouseSurchargeDetailCard` warnings 표시 확인 + E2E(필요 시 `E2E_PORT` 격리).

> 800줄 정책: `multi-house-surcharge-count.ts` 현재 줄 수 확인 후 시군구 헬퍼는 `population-decline-areas.ts`로 격리(count.ts 비대화 방지).

---

## 관련 메모리
[[project_transfer_multi_house_gaps]] · [[feedback_pre_anchor_verification]] · [[feedback_no_unfavorable_application_without_legal_basis]] · [[feedback_api_zod_schema_sync]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[project_transfer_regulated_area_regioncode]]
