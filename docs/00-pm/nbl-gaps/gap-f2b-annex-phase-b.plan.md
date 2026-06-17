# F2 Phase B — 별표4·5·별표1의3·복잡비고·6호휴양 자동산출

> F2 Phase A(별표3 직장운동경기부 체육시설 · 별표6 예비군 ✅PR#249 `20c1f10c`)에서 **후속(scope OUT)으로 남긴** 잔여 자동산출. 별표4(운동경기업)·별표5(종업원) 체육시설, 6호 휴양 §83의4⑫ 3요소, 복잡 비고(용도지역별 배율·종목합산·선수가산), 목장 별표1의3 per-head. **충실도 향상** — 직접입력(`standardAreaLimit`) fallback 유지가 안전망.
>
> KoreanLaw 본문 실측: 2026-06-17 (시행규칙 mst=286379 §83의4·별표3·4·5 / 시행령 mst=286211 §168의11·§168의10 / 지방세법 시행령 mst=286395 §101).

---

## 0. Phase A 대비 변경 요약 (한눈에)

| 항목 | Phase A (✅PR#249) | Phase B (본 계획) |
|---|---|---|
| 별표3 직장운동경기부 체육시설 | ✅ 종목 lookup(실외11·실내3) | — |
| 별표6 예비군 | ✅ 부대편성×시설 합산 | — |
| **별표4 운동경기업 체육시설** | ❌ standardAreaLimit | **B-1** 체육시설 유형 분기 + 종목 lookup |
| **별표5 종업원 체육시설** | ❌ standardAreaLimit | **B-1** 종업원수 5구간 선형보간 |
| **별표3·4 비고2 종목합산** | ❌ 직접입력 | **B-2** 다종목 max(자동화 가능) |
| **별표3 비고4 실내미설치=800** | ❌ | **B-2** (자동화 가능) |
| **별표3·4 비고5/4 선수가산** | ❌ | **B-2** 테니스·연식정구 2인초과 가산 |
| **실내 부속토지 용도지역별 배율** | ❌ 직접입력 | **B-2** 지방세법 §101② cross-statute (직접입력 유지 권장) |
| **6호 휴양 §83의4⑫ 3요소** | ❌ standardAreaLimit | **B-3** 옥외방목장+부설주차장×2+건축물부속토지 합산 |
| **목장 별표1의3 per-head** | 하드코딩 동결 | **B-4** blocker (정본 미확보) |

---

## 1. 법령 근거 (KoreanLaw 본문 실측)

### 1.1 위임 구조 (§168의11①1호 + §83의4)

시행령 §168의11①1호(체육시설용 토지) 본문 실측 — 가·나·다·라목 4분:
- **가목** 선수전용 체육시설용 토지 → §83의4①(직장운동경기부 = 별표3)·§83의4③(운동경기업 = 별표4)
- **나목** 종업원 체육시설용 토지 → §83의4④(별표5)
- 다목 체육시설업(체육시설법) / 라목 경기장운영업 — 면적기준 없음(직접사용 토지)

> ※ §83의4는 "가목(1)"=직장운동경기부, "가목(2)"=운동경기업으로 세분 인용. 시행령 본문은 가목만 노출(세부 (1)(2)는 시행규칙이 위임 세분). **별표3=가목(1), 별표4=가목(2), 별표5=나목** 으로 확정.

| 별표 | 위임 | 적용 주체 | 정본 |
|---|---|---|---|
| 별표3 | §83의4①(가목1) | 직장운동경기부 선수전용 | ✅(Phase A 구현) |
| **별표4** | §83의4③(가목2) | **운동경기업 선수전용** | ✅ 실측(아래 1.2) |
| **별표5** | §83의4④(나목) | **종업원 체육시설** | ✅ 실측(아래 1.3) |
| 별표6 제1·2호 | §83의4⑨⑩(5호다목) | 예비군훈련장 | ✅(Phase A 구현) |
| **별표1의3** | §168의10③ | **목장 가축별 기준면적·두수** | ❌ **blocker**(아래 1.5) |

### 1.2 별표4 정본 (운동경기업 선수전용 체육시설, 단위 ㎡)

실외 11종 / 실내 3구간 — **구조는 별표3과 동일, 면적만 상이(약 1.5배)**:

| 종목(실외) | 별표4 | (참고 별표3) | 실내 | 별표4 | (별표3) |
|---|---|---|---|---|---|
| 축구장 | 16,500 | 11,000 | 구기류¹ | 1,200 | 800 |
| 야구장 | 21,000 | 14,000 | 수영·수구·다이빙 | 1,500 | 1,000 |
| 럭비장 | 13,500 | 9,000 | 빙상²·롤러 | 2,700 | 1,800 |
| 필드하키장 | 9,750 | 6,500 | | | |
| 테니스장 | 975 | 650 | | | |
| 연식정구장 | 975 | 650 | | | |
| 미식축구장 | 10,500 | 7,000 | | | |
| 승마장 | 9,300 | 6,200 | | | |
| 사격장 | 6,000 | 4,000 | | | |
| 궁도장 | 10,650 | 7,100 | | | |
| 기타 | 4,500 | 3,000 | | | |

¹ 핸드볼·배구·농구·탁구·배드민턴·복싱·유도·검도·태권도·펜싱·체조·역도·씨름·레슬링·볼링
² 아이스하키·피겨·롤러스케이트

**별표4 비고**: ①실내 부속토지=바닥면적×용도지역별 배율(지방세법 시행령 §101②) ②축구·야구·럭비·필드하키·미식축구 중 2종목↑=최대 1종목 ③실내 바닥≤기준면적 시 바닥면적×배율 ④테니스·연식정구 선수 2인 기준, 초과 2인마다 **+725㎡**. (별표3 대비 "실내 미설치=800" 비고 없음, 선수가산 단가 483→725㎡ 상이.)

### 1.3 별표5 정본 (종업원 체육시설, 단위 ㎡) — 종업원수 5구간 선형보간

| 구분 | ~100인 | 100~500 | 500~2,000 | 2,000~10,000 | 10,000~ |
|---|---|---|---|---|---|
| 실외 운동장 | 1,000 | 1,000+(n−100)×9 | 4,600+(n−500)×3 | 9,100+(n−2,000)×1 | 17,100 |
| 실외 코트 | 970 | 970 | 1,940 | 2,910 | 2,910 |
| 실내체육시설 | 150 | 300 | 450 | 900 | 900 |

> 구간 경계 연속성 확인(실측): n=500→1,000+400×9=4,600 / n=2,000→4,600+1,500×3=9,100 / n=10,000→9,100+8,000×1=17,100. 운동장은 **구간내 선형보간**, 코트·실내는 **계단식 고정**.

**별표5 비고**: ①종업원수=당해 사업장 근무 종업원 ②**종업원 50인 이하=코트면적만**(운동장·실내 제외) ③실내 바닥≤기준면적 시 바닥면적 ④실내 부속토지=바닥면적×용도지역별 배율(지방세법 시행령 §101②).

### 1.4 6호 휴양시설 §83의4⑫ 3요소 합산 (정본 실측)

기준면적 = 다음 3호의 **합**:
1. 옥외 동물방목장·옥외 식물원 토지 면적 (직접 측정 면적)
2. 부설주차장 = 「주차장법」 설치기준면적의 **2배 이내** (도시교통정비 촉진법 교통영향분석 대상은 통보면적)
3. 「지방세법 시행령」 §101①2호 건축물 부속토지 = 건축물 바닥면적(시설물은 수평투영면적) × **§101② 용도지역별 배율** 범위 내 부속토지

> 6호 휴양시설업 범위(§83의4⑪): 관광진흥법 전문휴양업·종합휴양업 + 유사시설(스키장·수영장업 포함, **온천장 제외**).

### 1.5 별표1의3 (목장 per-head) — ✅정본 확보·재구현 (사용자 제공 2026-06-17)

- 근거: §168의10③ "별표 1의3에 규정된 가축별 기준면적과 가축두수를 적용하여 계산한 토지의 면적"(본문 실측 ✅).
- **KoreanLaw get_annexes 완전 실패**(2026-06-17 재시도):
  - `lawName="소득세법 시행령 별표 1의3"` → "소득세법 시행령 의3" 절단 → NOT_FOUND
  - `lawName="소득세법 시행령", annexNo="별표 1의3"` → "별지 제1호서식"(납세지신고서)으로 오라우팅
  - `별표 1의2`도 동일 절단 → **가지번호(N의M) 별표 파서 미지원 확정**
- ~~구 8축종 동결값(한우10·젖소15 등)~~ → **✅정본 확보(사용자 제공 이미지, 개정 2008.2.22)·재구현**. 구 동결값은 **초지·사료포(목장용지 핵심) 누락** 오류로 기준면적 100~1000배 과소(비사업용 과대판정·불리) → 정정.
- **정본 9구분** = (축사+부대시설 ㎡) + (초지+사료포 헥타르×10,000) ÷ 가축두수 단위. 1두(수)당: 한우육우사육 **7,512.5** / 비육 3,012.5 / 유우 7,518 / 양 751.1(10두당) / 사슴 758.2 / 토끼 30.4(100두당) / 돼지 12.6(5두당) / 가금 0.49(100수당) / 밍크 2.8(5수당).
- 구현: `LIVESTOCK_STANDARD`(4요소)·`getLivestockStandardArea`(곱셈 먼저로 부동소수 회피)·축종 select 9종(한우 사육/비육 분리·말→한우 사육 비고·염소 제거). KoreanLaw 가지번호("1의3") 파서는 끝까지 실패 → 사용자 직접 제공으로 확보.
- **Do 확보 절차**: ①법제처 국가법령정보센터 사이트 직접(별표 다운로드) ②`get_law_text`로 부칙/연혁 우회 불가 시 사용자 제공. 정본 대조 전 numeric 동결.

### 1.6 용도지역별 적용배율 — cross-statute (지방세법 시행령 §101②) ✅정본 확보·자동화

- 별표3·4·5 비고 + §83의4⑫3호 공통 의존. 별표 비고는 구 조문번호 "§131의2②", §83의4⑫3호·§101①은 현행 "§101②" 인용 — **동일한 "용도지역별 적용배율"**(2010 지방세법 전면개정 전후 번호 차이, 별표 비고 미개정 잔존).
- **✅정본 확보(사용자 제공 2026-06-17)**: 전용주거 **5배** / 준주거·상업 **3배** / 일반주거·공업 **4배** / 녹지 **7배** / 미계획 **4배** / 도시지역 외 **7배**. (KoreanLaw·WebSearch·WebFetch는 표 추출 실패 — 사용자 직접 제공으로 확보.)
- **자동화 완료**: `ZONE_AREA_MULTIPLIER`(other-land.ts) zoneType→배율 매핑. 6호 3호(건물 바닥×배율)·체육 실내 부속토지(비고1·3: `min(바닥, 표값)×배율`) 자동. `residential`(세분 전 주거지역)은 §101② 6구분 외 → 직접입력 fallback(추정 금지).

---

## 2. 현황 (Phase A 구현 실측 — 확장 대상)

- `data/area-standards.ts`: `SPORTS_OUTDOOR_STD`(별표3 실외11)·`SPORTS_INDOOR_STD`(별표3 실내3)·`RESERVE_FORCES_STD`(별표6). 별표4·5 미인코딩.
- `other-land.ts:52` `resolveAreaLimit`: `case "sports"`(62-69)=별표3 종목 lookup·미선택 fallback / `case "reserve_forces"`(71-79)=별표6 / `case "parking_attached"·"resort"`(81-83)=standardAreaLimit 직접입력.
- `types.ts:216` `NblRelatedBusinessType`("sports" 등) / `:228 OtherLandUsage` / `:246 sportsFacilityType`(별표3 종목)·`:248 reserveForcesUnitSize`·`:250 reserveForcesFacilities`.
- `lib/stores/calc-wizard-asset-nbl-other.ts`: `nblOtherSportsFacilityType`(30)·`nblOtherReserveUnitSize`(31)·`nblOtherReserveFacilities`(32).
- `pasture.ts`(목장): `getLivestockStandardArea(livestockType, count)`(별표1의3 미대조값).
- `components/calc/transfer/nbl/OtherLandDetailSection.tsx`: relatedBusinessType RadioCardGroup 10옵션 + sports 종목 Select + reserve 부대규모/시설 ToggleCard(Phase A). **UI 안내 일부 선반영**(실측): `:34` sports desc "별표3·4·5"·`:185` resort hint "옥외방목장+부설주차장×2+건축물 부속토지" 이미 작성(B-3 resort hint 재사용 가능). `:46` AREA_BASIS sports legalBasis=§168의11①1호 **단일**(유형별 분기 없음).

**한계**: sports는 별표3(직장운동경기부) 단일 가정. 운동경기업(별표4)·종업원(별표5)은 별도 유형 분기·입력이 없어 standardAreaLimit 직접입력으로만 처리됨.

---

## 3. 설계 — 4 sub-phase (독립 PR 분할 가능)

### B-1 — 별표4·5 체육시설 유형 확장 (정본 확보 ✅ — 최우선)

**핵심 구조 결정**: 현재 `sports`는 별표3 종목 lookup만. 별표4·5를 더하려면 **체육시설 유형**을 먼저 선택해야 함(종목 동일·면적 상이 + 종업원 산식 별도).

신규 필드:
- `nblOtherSportsCategory`: `"workplace" | "business" | "employee"` (기본 `"workplace"`=별표3, **하위호환 default**).
- (employee 전용) `nblOtherEmployeeCount`: 종업원수(정수) + `nblOtherEmployeeFacilityKinds`: `Array<"field"|"court"|"indoor">`(운동장·코트·실내 **보유 시설 다중** — 각 기준면적 합산). ⚠️별표5 본문에 시설간 "합산" 명문 없음(표 구조상 병렬) → 보유 시설별 기준면적 합으로 해석, **Do 유권해석 확인 필요**.

데이터(`data/area-standards.ts` 확장):
```ts
// 별표4 운동경기업 선수전용 (§83의4③)
export const SPORTS_BUSINESS_OUTDOOR_STD = { soccer:16500, baseball:21000, rugby:13500,
  field_hockey:9750, tennis:975, soft_tennis:975, american_football:10500, equestrian:9300,
  shooting:6000, archery:10650, other_outdoor:4500 } as const;
export const SPORTS_BUSINESS_INDOOR_STD = { ball_court:1200, swimming:1500, ice_rink:2700 } as const;

// 별표5 종업원 체육시설 (§83의4④) — 종업원수 선형보간
export function employeeSportsArea(
  kind: "field" | "court" | "indoor", employeeCount: number,
): number {
  const n = employeeCount;
  if (kind === "court")  return n <= 500 ? 970 : n <= 2000 ? 1940 : 2910;
  if (kind === "indoor") return n <= 100 ? 150 : n <= 500 ? 300 : n <= 2000 ? 450 : 900;
  // field(운동장) 선형보간
  if (n <= 100)   return 1000;
  if (n <= 500)   return 1000 + (n - 100) * 9;
  if (n <= 2000)  return 4600 + (n - 500) * 3;
  if (n <= 10000) return 9100 + (n - 2000) * 1;
  return 17100;
}
```

`resolveAreaLimit` `case "sports"` 분기 확장:
```ts
case "sports": {
  const cat = o.sportsCategory ?? "workplace";
  if (cat === "employee") {
    const kinds = o.employeeFacilityKinds, n = o.employeeCount;
    if (kinds?.length && n != null && n > 0) {                         // n>0 가드(0/음수=fallback)
      if (n <= 50) return employeeSportsArea("court", n);              // 비고2: 50인↓ 코트만
      return kinds.reduce((s, k) => s + employeeSportsArea(k, n), 0);  // 보유 시설 합산
    }
    return o.standardAreaLimit; // fallback
  }
  const tbl = cat === "business" ? SPORTS_BUSINESS_OUTDOOR_STD : SPORTS_OUTDOOR_STD;
  const itbl = cat === "business" ? SPORTS_BUSINESS_INDOOR_STD : SPORTS_INDOOR_STD;
  const t = o.sportsFacilityType;
  if (t) return (tbl as Record<string,number>)[t] ?? (itbl as Record<string,number>)[t] ?? o.standardAreaLimit;
  return o.standardAreaLimit; // 3중 fallback
}
```

> ⚠️ 50인 이하 비고2는 employee + 보유 시설 무시하고 court 강제 — 산식 우선순위 명확히(테스트 anchor 고정).
> ⚠️ 별표3·4·5 공통 비고3(실내 바닥면적 ≤ 기준면적 시 **바닥면적** 인정)은 실내 바닥면적 입력 필요 → **B-2에서 처리**(용도지역별 배율과 동일 실내 부속토지 묶음). B-1 `employeeSportsArea`는 표 기준면적만 산출.

### B-2 — 복잡 비고 (부분 자동화 + cross-statute 직접입력)

> **구현 완료(전체)**: 선수가산(별표3 483/별표4 725)·실내미설치(비고4 800)·종목합산(**합산 원칙** + 비고2 5종목군 max1)·용도지역별 배율(§101② 정본 자동: 6호 3호 건물 바닥×배율 + 체육 실내 부속토지 `min(바닥,표값)×배율`). `residential`만 직접입력 fallback. ✅ `applySportsNotes`·`sumSportsEvents`·`ZONE_AREA_MULTIPLIER`. (당초 "종목합산 명문부재 유보"는 사용자 지적으로 **합산 원칙 시정** — [[feedback_no_unfavorable_application_without_legal_basis]].)

| 비고 | 출처 | 자동화 난도 | 설계 |
|---|---|---|---|
| 종목 합산(2종목↑ max 1) | 별표3·4 비고2 | 중 | `nblOtherSportsExtraEvents`(다중선택) → 축구·야구·럭비·필드하키·미식축구 중 **max 1만** 적용. **그 외 종목(테니스·승마·사격 등)은 비고2 비적용** — 합산 방식 본문 명문 부재 → **Do 유권해석 확인 필요**(추정 금지). |
| 선수 가산(테니스·연식정구) | 별표3 비고5(483)·별표4 비고4(725) | 중 | `nblOtherPlayerCount` → `base + max(0, ceil((p−2)/2))×(483 or 725)`. category별 단가. |
| 실내 미설치=800 | 별표3 비고4 | 하 | sports+workplace+실내 미설치 토글 → 800. |
| **실내 부속토지 용도지역별 배율** | 별표3·4·5 비고1·3 | **상**(cross-statute) | 지방세법 §101② 배율표 **미확보** → **직접입력 유지**(`standardAreaLimit` 또는 별도 배율 입력) + violet 안내카드. 정본 확보 시 용도지역 select+배율 자동. **비고3(실내 바닥면적 ≤ 표 기준면적 시 바닥면적 인정)** 포함 — 바닥면적 입력 필요. |

> B-2는 **부분 자동화**: 종목합산·선수가산·실내미설치는 자동화 가능, 용도지역별 배율만 직접입력 유지. 입력 필드 증가가 크므로 B-1 안정화 후 착수.

### B-3 — 6호 휴양 §83의4⑫ 3요소 합산

신규 필드(resort 전용):
- `nblOtherResortOutdoorArea`: 옥외 방목장·식물원 면적(직접 측정).
- `nblOtherResortParkingStdArea`: 주차장법 설치기준면적 → 엔진에서 **×2**(2배 이내).
- `nblOtherResortBuildingArea`: §101①2호 건축물 **부속토지 면적**(바닥면적 × 용도지역별 배율 적용 후 — 배율 미확보 시 부속토지 면적 직접입력). 엔진 `resortBuildingAttachedArea` 매핑. ⚠️바닥면적(FloorArea)이 아닌 **배율 적용 후 부속토지 면적** — 바닥면적 직접입력 시 배율 누락 과소 주의.

`resolveAreaLimit` `case "resort"`:
```ts
case "resort": {
  const a = o.resortOutdoorArea ?? 0;
  const p = (o.resortParkingStdArea ?? 0) * 2;          // §83의4⑫2호 2배
  const b = o.resortBuildingAttachedArea ?? 0;          // 3호 (배율 적용 후 면적·직접입력)
  const sum = a + p + b;
  return sum > 0 ? sum : o.standardAreaLimit;           // 3요소 미입력 시 fallback
}
```

> 3호 건축물 부속토지는 용도지역별 배율(§101②) 의존 → B-2 cross-statute와 동일 한계. **배율 적용 후 면적을 직접입력**받는 절충(`resortBuildingAttachedArea`).

### B-4 — 목장 별표1의3 per-head (blocker)

- `livestock-standards.ts` numeric 동결 유지. 정본 확보 전 변경 금지.
- Do 절차: 1.5 참조(법제처 직접 → 정본 대조 → 8축종 정정 + per-head anchor).
- **정본 미확보 시 B-4 제외**(B-1~B-3만 진행).

---

## 4. 케이스 매트릭스

| # | sub | 입력 | 기준면적 | 기대 |
|---|---|---|---|---|
| C1 | B-1 | sports·workplace·축구장 | 11,000 | 별표3(회귀, Phase A 불변) |
| C2 | B-1 | sports·business·축구장 | 16,500 | 별표4 lookup |
| C3 | B-1 | sports·employee·[field]·종업원 300 | 1,000+200×9=2,800 | 별표5 선형보간 |
| C4 | B-1 | sports·employee·[field]·종업원 40(≤50) | 970(코트) | 비고2 코트강제 |
| C5 | B-1 | sports·business·종목 미선택·standardAreaLimit=8000 | 8,000 | fallback(회귀) |
| C6 | B-2 | sports·workplace·테니스·선수 6인 | 650+2×483=1,616 | 선수가산(483) |
| C7 | B-2 | sports·business·테니스·선수 6인 | 975+2×725=2,425 | 선수가산(725) |
| C8 | B-2 | 실내체육 부속토지(용도지역별 배율) | 직접입력 | cross-statute 안내 |
| C9 | B-3 | resort·옥외 5,000+주차기준 1,000(×2)+건축부속 2,000 | 9,000 | 3요소 합산 |
| C10 | B-3 | resort·3요소 미입력·standardAreaLimit=12000 | 12,000 | fallback |
| C11 | B-4 | 목장 한우 100두 | 1,000(현행 동결) | blocker(정본 대조 전 불변) |
| C12 | F3 연동 | landArea > 자동기준면적 | computeAreaProportioning | 초과분 부분안분 중과 |

---

## 5. 14 동기화 지점 (B-1 기준, B-2·B-3 동형 확장)

| # | 지점 | B-1 작업 |
|---|---|---|
| ① | AssetForm(`calc-wizard-asset.ts`) | `nblOtherSportsCategory`(string)·`nblOtherEmployeeCount`(string)·`nblOtherEmployeeFacilityKinds`(string[]) |
| ② | factory(`calc-wizard-asset-factory.ts`) | 기본 `"workplace"`·`""`·`[] as string[]` (800줄 경계 — 1줄 압축 패턴) |
| ③ | normalize(`calc-wizard-asset-nbl.ts`·`-nbl-other.ts`) | NblOtherFormSlice 동일 default |
| ④⑬ | API(`transfer-tax-api.ts` prefix-pick `k.startsWith("nbl")`) | 자동(평면 raw) — 신규 키 prefix 확인 |
| ⑤ | UI(`OtherLandDetailSection.tsx`) | sports 블록에 **체육시설 유형** RadioCardGroup 3옵션 + employee 시 종업원수 DecimalInput·시설구분 ToggleCard(다중) + **유형별 legalBasis 분기**(별표3=§83의4①·별표4=§83의4③·별표5=§83의4④, 현 AREA_BASIS sports=§168의11①1호 단일을 분기) |
| ⑥ | 사이드바 | N/A(면적 입력은 합계 비대상) |
| ⑦ | 결과카드(`NonBusinessLandResultCard.tsx`) | 자동산출 기준면적(areaProportioning 면적 — Phase A 기존 표시로 충족). **[B-1 deviation] 유형별 별표 근거 라벨(별표3/4/5)은 엔진 result에 sportsCategory 부재 → 후속**(result 확장 필요). UI 입력측 legalBasis(§83의4①/③/④)는 ⑤에서 유형별 분기 완료 |
| ⑧ | validate(`transfer-tax-validate-asset.ts`) | sports+employee → 종업원수·시설구분 필수, 그 외 → 종목 OR standardAreaLimit(3중 fallback 동기화) |
| ⑨⑩ | Zod enum | 해당 없음(neither 메인/컴패니언 enum) |
| ⑪ | acq fallback | N/A |
| ⑫ | Zod(`transfer-tax-schema-sub.ts` `nonBusinessLandRawSchema`) | `nblOtherSportsCategory:z.string().optional()`·`nblOtherEmployeeCount:z.string().optional()`·`nblOtherEmployeeFacilityKinds:z.array(z.string()).optional()` |
| ⑭ | route 매핑(`form-mapper-helpers.ts` `buildOtherLand`) | `sportsCategory`·`employeeCount`(parseNumber)·`employeeFacilityKinds`(asArray<string>) |

엔진 타입(`types.ts OtherLandUsage`): `sportsCategory?`·`employeeCount?`·`employeeFacilityKinds?` 추가.

> **B-2·B-3 필드 동형 확장**: `sportsPlayerCount`·`sportsExtraEvents`·`indoorNotInstalled`(B-2)·`resortOutdoorArea`·`resortParkingStdArea`·`resortBuildingAttachedArea`(B-3)도 동일 14지점(①②③⑫⑭ + ⑤UI + ⑧validate). 엔진 적용점은 `applyTableNotes`(B-2)·`resort` 3요소(B-3).

---

## 6. anchor 명세 (Pre-Do FAIL 우선)

- **AT-F2B-1 (Pre-Do, 별표4)**: sports·business·축구장·landArea 18,000 → 기준 16,500·초과 1,500 areaProportioning. 현재 standardAreaLimit 미입력이면 면적기준 미적용(사업용) → FAIL 확보 → 구현 → PASS.
- **AT-F2B-2 (별표5 선형보간)**: employee·[field]·종업원 300 → 2,800. 비교 종업원 600 → 4,600+100×3=4,900.
- **AT-F2B-3 (비고2 50인↓)**: employee·[field]·종업원 40 → 970(코트강제, 보유 시설 무시).
- **AT-F2B-4 (회귀, 별표3 불변)**: workplace·축구장 → 11,000(Phase A 동일).
- **AT-F2B-5 (선수가산 단가 분기)**: workplace 테니스 6인→1,616 / business 테니스 6인→2,425.
- **AT-F2B-6 (6호 3요소)**: resort 5000+1000×2+2000 → 9,000.
- **AT-F2B-7 (fallback 회귀)**: 유형선택 미입력·standardAreaLimit=8000 → 8,000.
- **AT-F2B-8 (별표1의3 동결)**: 목장 한우 100두 numeric 불변(현행값 toBe — 정본 대조 전 변경 금지).
- **AT-F2B-9 (보유시설 합산)**: employee·[field,court]·종업원 600 → 4,900+1,940=6,840.

---

## 7. 규모·위험·우선순위

- **규모**: B-1 **M**(데이터 표 + 유형분기 + 선형보간 + 14지점) / B-2 **M**(부분 자동화·입력 증가) / B-3 **S** / B-4 **blocker**.
- **우선순위**: B-1 → B-3 → B-2 → B-4. B-1·B-3은 정본 확보·독립. B-2는 입력 필드 급증 + 용도지역별 배율 cross-statute → 안정화 후. B-4는 정본 확보 선행.
- **위험**:
  - 위험 **중** — 직접입력 fallback이 모든 sub-phase 안전망(자동화 실패해도 기존 경로 유지). 회귀 anchor(AT-F2B-4·7) 필수.
  - **체육시설 유형 default = "workplace"** 3중 일치(factory·normalize·UI) — 미설정 시 별표3 유지(하위호환). memory `feedback_store_default_vs_ui_display_fallback` 준수.
  - **용도지역별 배율 정본 미확보**(§101② 표) — 추정값 금지. B-2 실내 부속토지·B-3 3호는 직접입력 유지.
  - **별표1의3 blocker** — KoreanLaw 완전 불가. 법제처 직접 확보 전 numeric 동결(B-4 제외 가능).
- **F3 연동**: 자동산출 기준면적이 정확할수록 F3 부분안분 중과(§168의11⑤⑥) 입력 품질 향상 — 독립 동작(F3 이미 머지 `472b55d4`).
- **scope 잔존(F2 Phase B 밖)**: §168의11⑥ 복합용도 건축물 부속토지 안분(1호 단일건축물 연면적비·2호 다수건축물 바닥면적비) · 별표3·4·5 비고1 "건축물 부속토지 해당 시 배율 미적용" 단서 예외.

---

## 8. 검증 체크리스트 (Do 완료 전)

- [ ] 케이스 매트릭스 C1~C12 전 분기 anchor
- [ ] Pre-Do anchor FAIL 확보 후 구현
- [ ] 14지점 grep 자가점검(⑫⑬⑭ 침묵 strip 주의)
- [ ] API fallback ↔ validation 동기화(3중 패턴)
- [ ] 체육시설 유형 default 3중 일치
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/non-business-land/` 통과
- [ ] 별표1의3 정본 확보 여부 명시(미확보 시 B-4 제외 + 동결 anchor)
- [ ] 용도지역별 배율 직접입력 유지 안내(violet 카드) — 추정값 미사용
