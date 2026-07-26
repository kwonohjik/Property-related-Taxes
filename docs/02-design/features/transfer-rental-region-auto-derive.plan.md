# 수정계획서 — 임대주택 소재지 상단 이동 + 소재 지역 주소 자동판별

> §155⑳ 장기임대주택 거주주택 비과세 특례 `RentalUnitCard` UI 수정.
> 대상 컴포넌트: `components/calc/transfer/RentalUnitCard.tsx`
> 작성일: 2026-07-26 · 상태: ✅ 구현 완료 (self-review 20건 반영 후 Do)
>
> **구현 요약**: 헬퍼 `deriveRentalRegionFromCode`(house-region.ts) · rental unit `regionCode: string` 추가(type·factory·migrate) · RentalUnitCard 주소 상단 이동 + 소재 지역 자동판별 배지/수동 라디오 fallback + "직접 지정" override.
> **테스트**: 헬퍼 anchor 7(§167 대조 포함) · RTL 5 · E2E 1(auto-derive+override) · 기존 rental E2E 10 회귀 통과 · tsc 0 · lint 0.

## 1. 목표 (사용자 요청)

1. **임대주택 소재지 (지번)** 필드를 **소재 지역** 위쪽으로 이동.
2. **소재 지역**(수도권/비수도권)을 주소에서 **자동 판별** — 수동 라디오 클릭 최소화.

## 2. 현행 실측 (file:line 검증 완료)

| 항목 | 위치 | 내용 |
|---|---|---|
| 소재 지역 라디오 | `RentalUnitCard.tsx:262-277` | `showRegion &&` 게이트. RadioCardGroup(`name="rental-region-{index}"`, rose). `value={unit.region}` |
| `showRegion` 조건 | `RentalUnitCard.tsx:110` | `가·마·아·구법·라(isLa)` |
| 임대주택 소재지(지번) | `RentalUnitCard.tsx:484-498` | `else`(=`!showAcqPrice`, 비-나·라) 분기 내부. `AddressSearch`, `onChange`→`set("rentalAddressJibun", v.jibun)` |
| 임대개시일 기준시가 | `RentalUnitCard.tsx:499-508` | 같은 `else` 분기. `jibun={unit.rentalAddressJibun}` 로 조회 |
| 취득당시 기준시가 | `RentalUnitCard.tsx:466-480` | `showAcqPrice`(나·라) 분기 — 주소 필드 **없음** |
| `region` 타입 | `calc-wizard-asset.ts:602` / `types.ts:30` | `'seoul-metro' \| 'non-metro'`(`RegionType`) |
| 기본값 | `calc-wizard-asset-factory.ts:33` | `region: "seoul-metro"` |
| migrate 정규화 | `calc-wizard-asset-migrate.ts:537-541` | legacy `"regulated-area"`→`seoul-metro`, 무효값→`seoul-metro` |
| API 변환 | `transfer-tax-api-helpers.ts:175` | `region: u.region` (그대로 전달) |
| validation | `transfer-tax-validate-rental-exception.ts` | region **검증 없음** (grep 0 — 항상 기본값 존재) |
| 엔진 소비 | 호출 `RentalUnitCard.tsx:101` / 정의 `eligibility.ts:142-148` | `deriveStdPriceCap(article, region, eff)` → `region==="seoul-metro"` (isCapital). (라목은 `check.ts:206` `nonCapitalOnly` 요건에서도 region 소비) |
| 결과뷰·사이드바 | — | rental `region` **미사용** (grep 0) |
| `AddressValue.pnu` | `address-search.tsx:29` | 존재. 앞 10자리=법정동코드, 앞 2자리=시도코드 |

**현행 렌더 순서**(스크린샷 일치): 소재 지역 → 918 → … → 아파트 → 실제 임대 기간 → (기준시가 분기: 취득당시 **또는** 주소+임대개시일 기준시가). 즉 주소가 소재 지역보다 **한참 아래**.

## 3. 지역 판별 로직 — 기존 유틸 재사용 불가 (중요)

임대 `region`(수도권/비수도권)은 **「수도권정비계획법」 §2 기준** = 서울(11)·인천(28)·경기(41) **전역**(군 포함), 광역시·세종 제외.

기존 두 유틸은 **분류 기준이 달라 그대로 쓰면 오판정**:

| 유틸 | 위치 | 분류 | 임대와 차이 |
|---|---|---|---|
| `deriveHouseRegionFromCode` | `house-region.ts:17` | capital/non_capital | capital에 광역시·세종 포함 |
| `classifyRegionCriteriaByCode` | `multi-house-surcharge-count.ts:37` | REGION/VALUE | 광역시=REGION, 강화·옹진·가평·연천·양평 군=VALUE(carve-out) |

**대조 예**: 부산(26)·세종(36) → §167 REGION이지만 임대 **비수도권**. 인천 강화군(28710)·경기 양평군(41830) → §167 VALUE이지만 임대 **수도권**.

→ **신규 헬퍼 필요**(순수 시도 기반, carve-out 없음):

```ts
// lib/calc/house-region.ts (deriveHouseRegionFromCode 옆, 단일 소스)
// 파일 상단 import 추가:
//   import type { RegionType } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
//   (house-region.ts:9-11 현재 import엔 RegionType 없음 — 추가 필요)
/**
 * 임대주택 소재지역(수도권/비수도권) — 수도권정비계획법 §2 기준.
 * 시도코드 11(서울)·28(인천)·41(경기) 전역 = 수도권(군 포함). 광역시·세종 제외.
 * regionCode 미입력 시 seoul-metro 기본값(factory·migrate와 일치).
 * ⚠️ §167의3 classifyRegionCriteriaByCode(광역시·carve-out)와 의도적으로 다름.
 */
export function deriveRentalRegionFromCode(regionCode?: string): RegionType {
  if (!regionCode) return "seoul-metro"; // 미입력/"" → 기본값(deriveHouseRegionFromCode의 !code→capital 패턴 일치)
  const sido = regionCode.slice(0, 2);
  return sido === "11" || sido === "28" || sido === "41" ? "seoul-metro" : "non-metro";
}
```

> **정정 반영**: ① 반환타입 `RegionType`(실측 `types.ts:30`, `RentalRegionType`은 미존재). ② `if(!regionCode) return "seoul-metro"` guard — 이게 없으면 `undefined`/`""`.slice → non-metro가 되어 factory 기본값·anchor(`undefined → seoul-metro`)와 모순. ③ `RegionType` import 경로 명시.

> **Do 진입 전 확인 필요**: 수도권정비계획법 §2·시행령 §2 로 "수도권=서울·인천·경기 전역(군 포함)" KoreanLaw MCP 재확인(정책: 추정 금지). 현재 코드 주석(`classifyRegionCriteriaByCode` "수도권 주요지역")과 상충하는 것은 §167 전용 carve-out 때문 — 임대 cap엔 미적용.

## 4. 설계 결정

### D1. 주소 필드 상단 이동 + 렌더 범위 확장

- 주소(지번) 필드를 **소재 지역 바로 위**(카드 상단부, 현 `262` 직전)로 이동.
- 현재 `else`(비-나·라) 분기 안에 있어 라목에서 안 보임 → **상단으로 빼면서 게이트 재정의**:
  `showAddress = showRegion || !showAcqPrice` = **나목만 제외**(가·다·마·바·아·자·구법·라 표시).
  - 라목: region(비수도권 요건) 자동판별을 위해 주소 필요 → 표시.
  - 다·바·자: region 숨김이나 임대개시일 기준시가 조회 jibun 필요 → 표시(현행 유지).
  - 나목: region 지역무관 + 취득당시 3억(조회 없음) → 주소 불필요, 숨김.
- **임대개시일 기준시가**(`499-508`)는 현 위치 유지 — `unit.rentalAddressJibun`을 state에서 읽으므로 주소 분리돼도 조회 정상. (주소는 region+jibun 소스로 상단, 조회 위젯은 임대기간 아래 그대로.)

### D2. region 자동판별 — onChange 단일 병합 (mirror-pattern 준수)

`AddressSearch.onChange`에서 jibun·regionCode·region을 **한 번의 `onChange` 병합**으로 set. useEffect 미러링 금지.

```tsx
onChange={(v) => {
  const patch: Partial<typeof unit> = { rentalAddressJibun: v.jibun };
  if (v.pnu && v.pnu.length >= 10) {
    // 주소 선택(handleSelect) → pnu 동반 → 자동판별 배지 활성
    patch.regionCode = v.pnu.slice(0, 10);
    patch.region = deriveRentalRegionFromCode(patch.regionCode);
  } else if (!v.jibun) {
    // 주소 clear(handleClear는 pnu:"" + jibun:"") → regionCode 리셋 → 배지 사멸·라디오 fallback 복귀
    patch.regionCode = "";
  }
  onChange({ ...unit, ...patch });
}}
```

- **정정(C1·C4)**: `address-search.tsx`는 주소 **선택**(`handleSelect`) 시에만 `onChange`를 발화하며 **항상 pnu 동반**(`handleInputChange`는 로컬 query만 갱신·onChange 미발화 → "수동 지번 타이핑→jibun 有·pnu 無" 경로 부재). 따라서 "무주소"는 **주소 미선택** 또는 **clear**를 뜻함. clear 시(`pnu:""`+`jibun:""`) `regionCode`를 **명시적으로 리셋**하지 않으면 stale 배지가 잔존하므로 `else if (!v.jibun)` 리셋 필수.
- dong/ho 재선택 발화는 같은 주소라 pnu 동반 → regionCode 동일값 재설정(무해). partial-guard(std price·면적 덮어쓰기 방지)는 `buildHouseAddressPatch`(`house-region.ts:40-53`) 패턴을 임대 std price 조회 경로에 준용(스코프 밖 — 현행 유지).

### D3. 소재 지역 표시 방식 — **자동 배지 + 무주소 시 수동 fallback** (권장)

**분기 술어**(정정 B4): 빈 문자열도 `!== undefined`면 참이 되어 라디오가 사멸하므로 **비어있지 않은 regionCode** 로 판정:
```tsx
const regionAuto = unit.regionCode.length >= 10; // "" → false → 라디오 fallback
```

- **`regionAuto` → 읽기전용 자동판별 배지**(FieldCard 래퍼 안, label "소재 지역"·hint "기준시가 상한 산정" 유지 — 정정 C5):
  - 배지 라벨은 **항상 `unit.region`** 으로 렌더(정정 B1 — `regionCode`에서 **재파생 금지**, display dual-truth 방지): `unit.region === "seoul-metro" ? "수도권 · 주소 자동판별" : "비수도권 · 주소 자동판별"`.
  - 토큰: `TONE.rose.badge`(bg-rose-200, `tones.ts` 단일 소스 — 인라인/동적 `bg-${tone}` 금지). testid `data-testid="rental-region-badge-{index}"` (정정 C2).
  - "직접 지정" 텍스트 링크(`text-rose-700 underline`, testid `rental-region-manual-{index}`) → 클릭 시 `set("regionCode", "")` → `regionAuto` false → **RadioCardGroup 노출**(정정 C3·B6). 별도 useState·useEffect 불필요(regionCode가 분기 소스 — mirror-pattern 준수). `unit.region` 값은 유지되어 라디오 초기 선택값이 됨.
  - **dual-truth 불가 증명**: 배지는 `regionAuto`(regionCode 有)일 때만 표시되고, regionCode는 D2에서 `region`과 **동시 set**되므로 이 상태에서 `region === deriveRentalRegionFromCode(regionCode)`가 항상 성립. 수동 조정은 regionCode를 비워 라디오로 전환하므로 배지-표시 상태에서 region이 어긋날 경로가 없음.
- **`!regionAuto` → RadioCardGroup**(현행, `name="rental-region-{index}"` 보존, `value={unit.region}`, native radio 신규 금지). 주소 미검색·clear·override 시 진입.

**근거(정책)**: 무주소 시 기본값 `seoul-metro`(cap 6억)는 **납세자 유리** 방향 → 비수도권 물건이 cap 초과인데 통과할 위험(과대적격). 순수 자동+유리 기본값은 법령정확성 위배 소지. 수동 fallback으로 무주소 시 사용자가 명시 선택 → 정확성 보존. (memory `feedback_no_unfavorable_application_without_legal_basis`는 불리 오적용 금지 취지이나, 여기선 유리 오적용 방지가 정확성 관점 핵심.)

**대안 B(저스코프, 미채택)**: 라디오 유지하되 주소 검색 시 자동 채움 + hint. 신규 필드·분기 없음. "자동 판별" 체감 약함.

→ **✅ 확정: 권장안**(자동 배지 + 무주소 수동 라디오 fallback + "직접 지정" override). 이하 14지점은 권장안 기준.

## 5. 변경 지점 — 14 동기화 지점 audit

| # | 지점 | 변경 | 내용 |
|---|---|---|---|
| ① | 타입 | **추가** | rental unit에 **`regionCode: string`(non-optional, "" 기본값)** — `calc-wizard-asset.ts:602`(region) 인접. ⚠️ **blast-radius 정정**: rental unit 형제 필드는 전부 non-optional이므로 optional `?`로 두면 D3 `unit.regionCode.length` 접근이 undefined 크래시+TS 에러. (house `HouseEntry.regionCode?`(`store:98`)는 optional이나 rental 스키마 관례가 다름 — non-optional 채택). boolean `regionAutoDetected` 대안 가능하나 재도출 이점으로 `regionCode` 채택 |
| ② | initial | **추가** | factory `regionCode: ""`(`calc-wizard-asset-factory.ts` makeDefaultRentalUnit). region 기본값 `seoul-metro` 유지. **주의**: `""`는 D2에서 pnu≥10일 때만 헬퍼 호출되어 실사용 무해 + 헬퍼 guard(`!regionCode→seoul-metro`)로 이중 방어 |
| ③ | normalize | **추가** | migrate `if (u.regionCode === undefined) u.regionCode = ""`(`calc-wizard-asset-migrate.ts` rentalUnits.forEach 블록, 현행 `:547~557` 기본값 라인들과 동일 위치). 정규화 후 `""`가 되므로 **분기 술어는 `length>=10`(≠ `!== undefined`)** — D3 참조 |
| ④ | API 변환 | 불변 | `region: u.region` 그대로(regionCode는 엔진 미전달 — UI 파생 소스일 뿐). 확인만 |
| ⑤ | UI 위젯 | **주 변경** | 주소 상단 이동(D1)+게이트 재정의, region 배지/라디오 분기(D3), onChange 병합(D2) |
| ⑥ | 사이드바 | 불변 | rental region 미사용 |
| ⑦ | 결과 카드 | 불변 | rental region 미표시(cap은 엔진이 region으로 산정 — 값 자동 반영) |
| ⑧ | validation | 불변 | region 검증 없음(기본값 항상 존재). 주소는 optional 유지 |
| ⑨~⑭ | Zod/Route | 불변 | region enum 기존. regionCode는 API 미전달이라 Zod 무영향 |

**요지**: 엔진·API·validation·결과 **무변경**. 실질 변경은 ⑤(UI) + 신규 헬퍼 + (권장안 시) ①②③ regionCode 필드. 매우 국소적.

## 6. 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 주소 미선택(조회 생략) | region 수동 라디오 fallback(D3, `regionCode.length<10`). 기본값 seoul-metro |
| 주소 clear(handleClear) | D2 `else if(!v.jibun)`로 `regionCode=""` 리셋 → 배지 사멸·라디오 복귀(정정 C1) |
| 라목(주소 신규 노출) | region 자동판별. cap은 취득당시 3억(지역무관)이나 라목 **비수도권 요건**(`check.ts:206` `nonCapitalOnly`) 판정에 region 사용 → 자동판별 유효 |
| 나목 | 주소·region 모두 숨김(지역무관) — 현행 유지 |
| 다·바·자(건설, region 숨김) | 주소는 조회용 표시(showAddress=T), region 배지/라디오 미표시(showRegion=F). D2가 region/regionCode를 set하나 배지·엔진 모두 미소비 → **무해**(정정 B-extra). 별도 게이팅 불요 |
| 군 지역(강화·가평·양평 등) | **수도권**으로 판별(§167과 반대) — anchor로 고정 |
| 광역시·세종(부산·세종 등) | **비수도권**으로 판별(§167과 반대) — anchor로 고정 |
| override("직접 지정") | `regionCode=""` → 라디오 노출, region 값 유지(라디오 초기값). 재검색 시 재자동판별 |

## 7. 검증 계획 (anchor 우선 — Pre-Do)

1. **신규 헬퍼 단위테스트** `deriveRentalRegionFromCode` (§167 대조 고정):
   - `"1168010100"`(서울 강남) → `seoul-metro`
   - `"2871000000"`(인천 강화군) → `seoul-metro` *(§167 VALUE 대조)*
   - `"4183025000"`(경기 양평군) → `seoul-metro` *(§167 VALUE 대조)*
   - `"2611000000"`(부산) → `non-metro` *(§167 REGION 대조)*
   - `"3611000000"`(세종) → `non-metro` *(§167 REGION 대조)*
   - `undefined` → `seoul-metro`(기본값)
2. **RTL** `RentalUnitCard`: AddressSearch onChange(pnu 有) mock → `region` 자동 set + 배지 노출 / pnu 無 → 라디오 노출. onChange 병합 1회 확인.
3. **E2E 갱신 필요**(`transfer-rental-155-20-active-ui.spec.ts`):
   - `:88·:153` `input[name="rental-region-0"]` 가시성 단언 → 시나리오가 주소 미검색이면 라디오 그대로 통과(무주소=fallback). 자동판별 케이스를 검증하려면 `data-testid="rental-region-badge-0"` 로 단언 교체.
   - `:99·:136` count 0(다·바·자 region 숨김) → 유지(showRegion=false, 배지·라디오 모두 미표시).
   - 신규: 주소 검색(mock, pnu 有) → `rental-region-badge-0` "수도권/비수도권" 검증 + "직접 지정"(`rental-region-manual-0`) 클릭 → 라디오 복귀 검증. `transfer-regulated-auto.spec.ts`의 AddressSearch mock 패턴 참고.
4. **회귀**: `npx tsc --noEmit` 0 · `npx vitest run` 전체 · rental E2E.
5. **브라우저 수동 확인**: 주소 검색→region 자동판별→cap label 반영, 무주소→라디오, 라목 주소 노출.

## 8. 리스크

- **E2E 회귀**: region 라디오 셀렉터 변경(권장안). 위 3항 갱신 필수.
- **수도권 정의 법령 확인**: §4 확인 필요 항목(수도권정비계획법 §2). 미확인 시 anchor 값 재조정 가능.
- **regionCode 신규 필드**(권장안): **①②③ 초기화 3지점**(타입·factory·migrate) 준수. ⚠️ 이는 mirror-pattern memory의 "**3중 패턴**"(display/API/validate **fallback** 3중)과 **다른 개념**(정정 B3) — regionCode는 순수 UI 파생 신호이고 `region`이 엔진 단일 진실이므로 mirror-pattern(3중 fallback)은 **N/A**. 대안 B 선택 시 불필요.
- **주소-조회 위젯 분리**(D1): 주소 상단·임대개시일 기준시가 하단으로 시각적 분리 → jibun은 state 공유라 기능 무영향이나 UX 안내(hint) 권장.
- **이중 std-price UX**(스코프 밖·정정 C6): rental `AddressSearch`(`RentalUnitCard.tsx:485`)가 `disableUnits` 미지정 → 동/호 유닛 드롭다운·공시가 자동채움 활성인데, 임대개시일 기준시가는 별도 `HousingStdPriceLookupField`로 조회 → 조회 경로 2개. region 소스로만 쓸 거면 `disableUnits` 고려 — **이번 스코프 밖, note만**.

## 9. 결정 사항 (✅ 확정 — 2026-07-26)

- **Q1. 소재 지역 표시 방식**: ✅ **권장안** — 자동판별 배지 + 무주소 시 수동 라디오 fallback.
- **Q2. "직접 지정" override 링크**: ✅ **포함** — 배지 옆 링크로 수동 라디오 노출(드문 오판정 대비).
- **Q3. 다·바·자(region 숨김)에서 주소 상단 노출**: ✅ **유지**(임대개시일 기준시가 조회 jibun 소스).
