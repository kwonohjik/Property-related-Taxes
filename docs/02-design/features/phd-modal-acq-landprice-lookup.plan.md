# PHD 3시점 건물기준시가 모달 — 취득시(2001년 기준) 공시지가 자동조회 계획

## 1. 목표 · 범위

"3시점 건물 기준시가 일괄 계산" 모달(`PhdBuildingStdPriceModalButton.tsx`)의
**시점별 개별공시지가** 섹션에서, **취득시(2001년 기준) 공시지가** 필드에
Vworld 자동조회를 추가한다. 대상은 **2000.12.31. 이전 취득 건물**
(취득 point `year ≤ 2000` → 2001.1.1. 기준 공시지가로 §164⑤ 산정기준율 환산).

**레이아웃 요구**: 취득 행에 **취득시기(연도) 표시 + 조회 버튼 + 공시지가 결과란을
같은 행**에 배치 (현행 `LandPriceLookupField` 컴팩트 인라인 패턴과 통일).

> **연도는 선택이 아니라 2001 고정**: pre-2001 취득 건물기준시가는 법령상
> 2001.1.1. 최초 고시분(`BUILDING_STD_FIRST_YEAR=2001`, §164⑤ 산정기준율)이
> **유일 기준연도**다 — 대체연도가 없으므로 "취득시기 선택버튼"은 **읽기전용
> "2001년 (기준)" 표시**로 구현한다(사용자 조정 불가).

범위 밖: 최초공시일(2005)·양도시(2026) 필드는 외부 `ThreePointStandardPriceInput`의
`LandPriceLookupField`가 이미 prefill(§4 참조). 이번 작업은 취득시 pre-2001만.

## 2. 현행 상태 (실측)

`PhdBuildingStdPriceModalButton.tsx`:
- 시점별 공시지가 = 단순 `CurrencyInput` (연도·조회 없음). 렌더: **373~402행** map.
- 취득 point `p.key==="acquisition" && p.year<=2000` 게이팅: 라벨 "(2001년 기준)"
  (379~385행), placeholder "2001.1.1. 현재 공시지가를 입력하세요"(394~398행).
- 상태: `landPrices: Record<string,string>`(119~121행), `points[].landPricePerM2`로 시드.
- **`jibun`/주소 prop 없음** — Vworld 조회 불가 (핵심 BLOCKER, §5).

## 3. 검증된 사실 (Explore 실측 — file:line)

| # | 사실 | 근거 |
|---|---|---|
| A | 두 실제 호출부 모두 지번 주소 스코프 보유 | `ThreePointStandardPriceInput.tsx:663`(`props.jibun`·`props.stdPriceAddress`), `inheritance/HouseValuationSection.tsx:317`(`asset.addressJibun`) |
| B | Vworld 조회 API가 `year`를 검증·clamp 없이 통과. propertyType="land" → NED `getIndvdLandPriceAttr` → `pblntfPclnd`(개별공시지가 원/㎡) | `app/api/address/standard-price/route.ts:219·125·258~291` |
| C | `recommendLandPriceYear`/`landPriceYearOptions`는 하한 clamp·2001 강제 없음. pre-2001 취득에 2001 옵션 미제공(취득연도 1999↑에서만 우연 포함) | `lib/utils/land-price-year.ts:22~35·53~68` |
| D | pre-2001 취득 건물기준시가 = 2001.1.1 공시지가 × 산정기준율. `BUILDING_STD_FIRST_YEAR=2001` | `lib/calc/phd-building-std-batch.ts:12~18·137~149` |
| E | 조회 결과는 `setLandPrices((s)=>({...s,[key]:v}))`로 주입 시 기존 `pt()`·`handleApplyAll`이 그대로 소비 | `PhdBuildingStdPriceModalButton.tsx:187~193·216·393` |

## 4. 설계

### 4.1 신규 prop — 주소 배관 (필수 선행)

`PhdBuildingStdPriceModalButton` Props(57~76행)에 추가:
```ts
/** 지번 주소 — 취득시 공시지가 Vworld 조회 활성화 조건. 미주입 시 조회 버튼 비활성. */
jibun?: string;
```
두 호출부에서 전달:
- `ThreePointStandardPriceInput.tsx:663` → `jibun={props.jibun}` (props.jibun은 682·707·733행에서 이미 사용 중 — 스코프 확인됨)
- `HouseValuationSection.tsx:317` → `jibun={asset.addressJibun || undefined}` (353·359행 등에서 이미 사용 중)

(주소 상세가 필요하면 `stdPriceAddress`도 가능하나, land 개별공시지가 조회는
필지 단위라 **지번(jibun)만으로 충분**하다 — dong/ho 불요, §3B.)

**jibun 미주입 시 fallback**: 조회 버튼만 비활성(`canLookup=false`)되고, 공시지가
결과란(CurrencyInput)은 **편집 가능 상태로 유지**되어 수동 입력 경로가 보존된다
(현행 동작 무손실).

### 4.2 조회 연도 = 2001 고정 (선택 아님)

`land-price-year` 헬퍼는 pre-2001 취득에 2001을 제공하지 않고(§3C), 법령상 대체
기준연도도 없으므로(§1 인용), 취득 point 조회 연도는 **2001로 고정**한다. UI는
읽기전용 "2001년 (기준)" 표시 + 조회 버튼(선택 드롭다운 아님).

### 4.3 재사용 vs 슬림 위젯 — 권장안

프로젝트 정책상 개별공시지가 입력은 `LandPriceLookupField` 사용이 원칙
(components/calc/CLAUDE.md 절대 규칙). 단 이 모달의 시점별 공시지가는 **㎡당 위치지수
단일값**이라 `LandPriceLookupField`의 3열 중 **③토지기준시가(공시지가×면적) 열이
불필요**하고, 연도 로직도 2001 강제라 referenceDate 구동과 맞지 않는다.

- **권장(A) — `LandPriceLookupField` 확장** (정책 `feedback_land_price_lookup_field`
  "개별공시지가 필드는 LandPriceLookupField 필수" 준수):
  - `fixedYear?: number` — 연도를 referenceDate 무관하게 고정. **실측상 연도 로직이
    전면 referenceDate 구동이므로 다음 5지점을 모두 우회**해야 함:
    ① `effectiveYear`(L71) = `fixedYear ? String(fixedYear) : (selectedYear||recommendedYear)`
    ② `canLookup`(L125) — effectiveYear 경유라 자동 충족
    ③ `handleLookup`(L85~) year param = effectiveYear(=2001)
    ④ Select 트리거 표시(L159~) = "2001년 (기준)" 읽기전용
    ⑤ `disabled`(L157) — fixedYear 시 Select 비활성(고정 표시)
  - `hideLandStdPrice?: boolean` — ③토지기준시가 열(공시지가×면적) 미렌더 →
    2열(연도+조회 | 공시지가). 이 모달은 ㎡당 위치지수만 필요.
  - **시점 라벨 소실 주의**: `LandPriceLookupField.label`은 ②열(공시지가) 라벨이므로
    행 선두 "취득시" 식별이 사라진다 → 취득 행을 **"취득시 (2001년 기준)" 서브헤딩으로
    래핑**해 시점 정체성 유지(기존 FieldCard label과 동등).
  - **회귀면**: LandPriceLookupField는 13개 사용처 공유 컴포넌트 → fixedYear/
    hideLandStdPrice 미주입 시 기존 렌더 동일함을 스냅샷으로 확인(§7.4).
  - 예: 취득 행 = `<div><p>취득시 (2001년 기준)</p><LandPriceLookupField
    fixedYear={2001} hideLandStdPrice jibun={jibun} pricePerSqm={landPrices.acquisition}
    onPricePerSqmChange={v=>setLandPrices(s=>({...s,acquisition:v}))} /></div>`.
- 대안(B) — 모달 내 슬림 인라인(연도 2001 고정 + 조회 버튼 + 결과 CurrencyInput):
  `/api/address/standard-price` fetch 로직 복제. 장점: 공유 컴포넌트 무변경(회귀면 0).
  단점: fetch 로직 중복 + 정책(LandPriceLookupField 필수) 예외.

→ **권장 A** (정책 준수). 단 fixedYear가 5지점을 건드리므로 §7.4 회귀 검증을 필수화.
  A 구현이 과도하면(예: fixedYear 스레딩이 다른 사용처 로직과 충돌) B로 폴백하되
  정책 예외 사유를 문서화한다.

### 4.4 취득 행 렌더 (373~402행 map 내 분기)

```tsx
points.map((p) => {
  const isAcqPre2001 = p.key === "acquisition" && p.year != null && p.year <= 2000;
  if (isAcqPre2001) {
    return (
      <div key={p.key} className="space-y-1">
        {/* 시점 식별 라벨 — LandPriceLookupField가 제공 안 하므로 별도 서브헤딩 */}
        <p className="text-xs font-semibold text-violet-700">취득시 (2001년 기준) 공시지가</p>
        <LandPriceLookupField
          fixedYear={2001}
          hideLandStdPrice
          jibun={jibun}
          label="개별공시지가 (원/㎡)"
          pricePerSqm={landPrices[p.key] ?? ""}
          onPricePerSqmChange={(v) => setLandPrices((s) => ({ ...s, [p.key]: v }))}
        />
      </div>
    );
  }
  return (/* 기존 FieldCard + CurrencyInput — 최초공시/양도/취득≥2001 */);
})
```
결과값은 `landPrices.acquisition`에 주입되어 기존 `pt()`·`handleApplyAll` 파이프라인이
그대로 소비(§3E).

**행 레이아웃 일관성**: 취득 행만 2열 grid가 되어 최초공시/양도 행(단순 FieldCard)과
높이·너비가 달라진다. `hideLandStdPrice`로 2열까지 축소해 이질감을 최소화하되,
취득 행에만 조회 기능이 있는 것은 **의도된 차별**(pre-2001만 2001 조회 대상)이므로
수용한다. 최초공시/양도 행 확장은 이번 범위 밖(§1).

## 5. BLOCKER · 리스크 → **Pre-Do anchor 통과 (2026-07-10)**

**Vworld 2001 개별공시지가 데이터 실재 여부** — 실측 완료.

`GET /api/address/standard-price?jibun=<지번>&propertyType=land&year=2001` 실행:

| 지번 | 결과 |
|---|---|
| 서울 강남 역삼동 737 | ✅ 12,800,000 원/㎡ (공시일 2001-06-30, "2001년 개별공시지가") |
| 부산 해운대 우동 1407 | ✅ 1,740,000 원/㎡ |
| 서울 마포 합정동 366 | ⚠️ PRICE_NOT_FOUND (해당 PNU 2001 데이터 부재) |

→ **판정: 자동조회 타당 — BLOCKER 해소.** Vworld NED가 2001분을 정상 반환한다
(메모리의 1990 부재는 2001에 미적용). baseline 2024·비교 2005도 정상.

**잔여 엣지(설계 이미 커버):** 일부 필지는 2001 데이터 부재(2001 이후 분할·합병으로
현 PNU가 당시 미존재 등) → `PRICE_NOT_FOUND` 404. 이 케이스는 `LandPriceLookupField`의
기존 error 처리(`lookupError` "해당 연도 공시지가 없음", L108~109) + §4.1 **수동입력
유지** fallback이 이미 처리하므로 추가 조치 불필요. (pre-2001 취득 건물의 부수토지는
당시 존재했으므로 대개 2001 데이터가 있으나, 후속 필지변동 케이스에 한해 수동 입력.)

## 6. 변경 파일 · 동기화 지점

| 파일 | 변경 |
|---|---|
| `components/calc/inputs/LandPriceLookupField.tsx` | (권장 A) `fixedYear?`·`hideLandStdPrice?` prop 추가. **연도 5지점 스레딩**(effectiveYear L71·canLookup L125·handleLookup L85~·Select 표시 L159~·disabled L157) + ③열 조건부 미렌더. **13개 사용처 회귀 스냅샷 필수** |
| `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx` | Props에 `jibun?` 추가(57~76행), 취득 pre-2001 행을 "취득시 (2001년 기준)" 서브헤딩 + LandPriceLookupField로 분기 렌더(373~402행) |
| `components/calc/transfer/ThreePointStandardPriceInput.tsx` | 모달 호출(663행)에 `jibun={props.jibun}` 전달 |
| `components/calc/transfer/inheritance/HouseValuationSection.tsx` | 모달 호출(317행)에 `jibun={asset.addressJibun || undefined}` 전달 |

- 순수 UI/조회 배관 — **엔진 input·result·14지점 무관**(계산은 기존 `landPrices` 소비).
- `ThreePointAssetMajorRender.tsx:155`는 `props.jibun`을 이미 하위 전달 → 추가 조치 불필요(확인).

## 7. 검증 (verify)

1. **Pre-Do**: §5 Vworld 2001 조회 anchor (구현 착수 조건).
2. `npx tsc --noEmit` 0건.
3. 브라우저(Playwright 임시 스펙): 겸용/일반 자산 → PHD 활성 → 모달 열기 → 취득 pre-2001
   행에 연도(2001)+조회 버튼+결과란 한 행 노출 → 조회 클릭 → `landPrices.acquisition`
   채워짐 → "3시점 계산하기" 정상 산출.
4. 회귀: 취득 year≥2001·최초공시·양도 행은 기존 CurrencyInput 유지(무변경) 확인.
   `LandPriceLookupField` 기존 13개 사용처 스냅샷 회귀(fixedYear/hideLandStdPrice 미주입 시 동일 렌더).
5. 폰트 게이트(`text-[Npx]` 금지)·lint 통과.
