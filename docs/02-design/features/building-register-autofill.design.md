# 건축물대장 자동조회 → 건물 기준시가 폼 자동채움 — Design

> 계획서: [`docs/00-pm/building-register-autofill.plan.md`](../../00-pm/building-register-autofill.plan.md)
> 매핑표: [`docs/02-design/features/building-register-usage-mapping.draft.md`](./building-register-usage-mapping.draft.md)
> 작성일: 2026-06-24 · 상태: **Design** (Plan·Pre-Do 완료, Do 미착수)
>
> **본 문서의 역할**: 계획을 구현-즉시-가능한 **구체 계약**으로 전환 — TS 인터페이스·함수 시그니처·동결 매핑 테이블 코드·컴포넌트 명세·테스트 목록·파일 매니페스트. 계획과 모순 없음.
>
> ★ **엔진 input/result 신규 필드 0** → engine/ui 분리 없이 단일 design(Simplicity). 실제 변경:
> ① 순수 매핑 모듈 1 · ② API 프록시 라우트 1 · ③ PNU 분해 헬퍼 1 · ④ 폼 `pnu` 1필드 + AddressSearch onChange · ⑤ UI 조회 버튼 1.

---

## 0. 동결 사실 (Pre-Do 실측 — 추정 아님, 인용)

본 design이 전제하는 사실은 계획 §9.1·매핑 §Y·§Z에서 **실측 확정**됨. 재확인 불요.

| # | 사실 | 출처 |
|---|---|---|
| F1 | MVP = 표제부 `getBrTitleInfo` 단독(1-call). 베이스 `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo` | plan §2.1·§9.1 |
| F2 | 파라미터 = `serviceKey`·`sigunguCd`·`bjdongCd`·`platGbCd`·`bun`·`ji`·`_type=json` | plan §4.1·§9.1 |
| F3 | env = `MOLIT_RTMS_API_KEY` (data.go.kr 동일 인증키, 건축HUB 활용신청 승인 후 커버) | plan §3.3 |
| F4 | `_type=json` envelope = `response.body.items.item` (4표본 실측). 단건 시 객체, 다건 시 배열 | plan §9.1·draft §Y |
| F5 | User-Agent **불필요**(BldRgstHubService는 빈 UA·기본 UA 모두 NORMAL). 넣어도 무해 | plan §9.1 |
| F6 | PNU 분해: `sigunguCd=[0:5]`·`bjdongCd=[5:10]`·`platGbCd=(pnu[10]==="2"?"1":"0")`·`bun=[11:15]`·`ji=[15:19]` | plan §4.3·§9.1 |
| F7 | HUB `platGbCd` = `0=대지·1=산`(행정표준코드 확정). PNU `pnu[10]` = `1=대지·2=산`(`standard-price/route.ts:93-95`) | plan §9.1 |
| F8 | 구조: `strctCd` 9코드 대표 + `etcStrct` refine. 대표값만 = confidence `medium` | draft §Z-1 |
| F9 | 용도: `mainPurpsCd` 5자리 → §B override → miss 시 앞2자리 §A default. confidence `high\|medium` 2-등급(low 없음) | draft §Z-2 |
| F10 | 자동채움 = 양도시점(`trans*`)·상증(`val*`)만. 취득시점(`acq*`) 미채움 | plan §4.5 |
| F11 | `compositeMode` / `isMechanicalParking` / `apartmentConversionMode` ON = 버튼 비활성 | plan §2.2·§4.5 |
| F12 | 무확인 덮어쓰기(명시 버튼 클릭 = 동의, 형제 `LandPriceLookupField` 동형) | plan §4.5 |
| F13 | 연도 ∉ 2018~2026 = 용도 자동채움 비활성(scheme-60 한정). 구조는 연도 무관 | plan §2.2·§4.2 |

---

## 1. 파일 매니페스트 (실제 변경 지점)

| # | 파일 | 변경 | 신규/수정 |
|---|---|---|---|
| ① | `lib/tax-engine/data/building-standard-price/building-register-map.ts` | 순수 매핑 모듈(`mapStructure`·`mapUsage` + 4 테이블) | **신규** |
| ② | `app/api/address/building-register/route.ts` | 프록시 라우트(PNU 분해 + getBrTitleInfo + 매핑) | **신규** |
| ③ | `lib/geo/pnu-building-register.ts` | PNU 분해 헬퍼(`decomposePnuForBuildingRegister`) | **신규** |
| ④a | `lib/calc/building-std-price-form.ts` | `BuildingStdPriceFormState`에 `pnu: string`(`:105-169`, 소재지 그룹 `:123-129`) + `initialBuildingStdPriceForm`에 `pnu: ""`(`:188-238`) | 수정 |
| ④b | `components/calc/building-std-price/BuildingStdPriceForm.tsx` | AddressSearch `value` 블록에 `pnu: f.pnu`(`:306-314`) + onChange에 `pnu: v.pnu ?? ""`(`:316-326`) + initialAddress 복원에 `pnu`(`:131-140`) | 수정 |
| ⑤ | `components/calc/building-std-price/BuildingRegisterLookupField.tsx` | 인라인 조회 버튼 + 자동채움 핸들러 | **신규** |
| ⑤' | `components/calc/building-std-price/BuildingStdPriceForm.tsx` | 소재지 카드 내 `<BuildingRegisterLookupField>` 배치(`:327` AddressSearch 직후) | 수정 |
| T1a | `__tests__/tax-engine/building-standard-price/building-register-map.test.ts` | mapStructure·mapUsage anchor (프로젝트 표준 루트 패턴 — CLAUDE.md `__tests__/tax-engine/{tax}/`, 기존 building 테스트 8종 동거) | **신규** |
| T1b | `__tests__/tax-engine/building-standard-price/pnu-building-register.test.ts` | PNU 분해 anchor | **신규** |
| T2 | `e2e/building-register-autofill.spec.ts` | E2E | **신규** |

**비관여(확정)**: `proxy.ts`(미보호 `:6 PROTECTED_ROUTES=["/api/history","/api/pdf"]`) · zustand normalize/migration(폼은 `useState` 직접 초기화, 파이프라인 부재 — plan §6·§9.3) · `validateBuildingStdPriceForm`(`pnu` 비검증 확정 — 소재지 필드 일절 미검증 `building-std-price-form.ts:480-601`) · 엔진 input/result · CLAUDE.md 14지점 ④⑥⑦⑨~⑭.

---

## 2. 순수 매핑 모듈 — `building-register-map.ts` (①)

엔진 필드 0. `STRUCTURE_META`(키 검증)만 import. 순수 함수.

### 2.1 공개 타입·시그니처

```typescript
import { STRUCTURE_META } from "./structure-group-map";

/** 매핑 신뢰도 — high(직접/derive) | medium(대표값·대분류·면적의존). low 등급 없음(plan §9.2). */
export type RegisterMapConfidence = "high" | "medium";

export interface StructureMapResult {
  structureKey: string;      // STRUCTURE_META 키
  confidence: RegisterMapConfidence;
}

export interface UsageMapResult {
  usageNo: number;           // scheme-60 번호 (1~60, 61=기계식 제외)
  confidence: RegisterMapConfidence;
}

/**
 * 대장 strctCd(+etcStrct) → 국세청 구조키.
 * ① STRCT_CD_TO_KEY[strctCd] 대표 매핑 → ② etcStrct가 STRCT_ETC_REFINE에 명시 매칭 시 fine 키 refine.
 * - refine 성공 → confidence "high", 대표값만 → "medium".
 * - strctCd 미수록 → null(미채움·수동).
 */
export function mapStructure(
  strctCd: string,
  etcStrct: string | undefined,
): StructureMapResult | null;

/**
 * 대장 mainPurpsCd(5자리) → 국세청 usageNo.
 * ① PURPS_DETAIL_TO_USAGE[5자리] override → ② 앞2자리 PURPS_PREFIX_TO_USAGE default.
 * - "02"(공동주택) = grndFlrCnt≥5?1:2 derive(high).
 * - 면적의존(목욕장 등) = totArea 구간(medium).
 * - 미대응("23" 교정·군사·prefix 부재·호텔 등급부재) = null(미채움·수동).
 */
export function mapUsage(
  mainPurpsCd: string,
  grndFlrCnt: number | undefined,
  totArea: number | undefined,
  year: number,
): UsageMapResult | null;
```

### 2.2 동결 테이블 — 구조 (draft §Z-1)

```typescript
/** 대장 strctCd(2자리) → 국세청 대표 구조키. 9코드 완결 소표(plan §3.4·draft §Z-1). */
const STRCT_CD_TO_KEY: Readonly<Record<string, string>> = Object.freeze({
  "11": "brick",             // 벽돌구조 → 연와조
  "12": "cement_block",      // 블록구조 → 시멘트블록조
  "13": "stone",             // 석구조 → 석조
  "21": "rc",                // 철근콘크리트구조 → 철근콘크리트조  ✅실측
  "22": "precast_concrete",  // 프리캐스트콘크리트구조
  "31": "steel_frame",       // 일반철골구조 → 철골조
  "32": "light_steel_frame", // 경량철골구조 → 경량철골조
  "42": "steel_frame_rc",    // 철골철근콘크리트구조             ✅실측
  "51": "wood",              // 일반목구조 → 목조(고시 검증 RESOLVED, plan §3.4)
});

/**
 * etcStrct 자유텍스트 → fine 구조키 refine(명시 별칭만).
 * ★ 정규식 접미사/괄호 치환 금지(plan §3.4·§4.2): STRUCTURE_META 라벨은 `철골(철골철근)콘크리트조`(괄호)·
 *   `연와조`(≠`벽돌`)·`목구조`vs`목조` 충돌. 명시 키만 사용. 입력 정규화는 공백 제거까지만.
 */
const STRCT_ETC_REFINE: Readonly<Record<string, string>> = Object.freeze({
  // 11 벽돌구조 군
  "시멘트벽돌": "cement_brick",
  "흙벽돌": "lime_earth_brick",
  "석회": "lime_earth_brick",
  "황토": "ocher",
  "보강콘크리트조적": "reinforced_concrete_masonry",
  // 12 블록구조 군
  "보강블록": "reinforced_block",
  // 13 석구조 군
  "돌담": "stone_earth_wall",
  "토담": "stone_earth_wall",
  // 21 RC 군
  "라멘조": "ramen",
  "라멘": "ramen",
  // 31 철골 군 — 단일·비충돌 토큰만. `조립식패널`/`조립식패널eps`는 괄호형 표기(`조립식패널(EPS패널)`)
  //   부분문자열 충돌 + codil 미근거·실측 표본 미확보 → 제거(strctCd 31 = steel_frame 대표 medium fallback).
  "스틸하우스": "steel_house",
  "와이어패널": "wire_panel",
  "철파이프": "steel_pipe",
  "컨테이너": "container",
  "alc": "alc",
  // 51 목구조 군
  "통나무": "solid_wood",
  "경량목구조": "wood_frame",
  "중목구조": "wood_frame",
});
```

> **검증 완료**: 위 fine 키 전부 `STRUCTURE_META`에 존재(grep 실측). `alc`는 소문자 정규화 후 비교(입력 `ALC조` → 정규화 `alc조`). 패널 세분(prefab_panel·steel_frame_eps)은 실 etcStrct 표본 확보 후 추가 — 현재 strctCd 31 대표값 fallback.

### 2.3 `mapStructure` 구현 명세

매칭 방향을 단일 의사코드로 확정(서술 중첩 제거). `SORTED_REFINE_ENTRIES`는 키 길이 내림차순 **모듈 상수 1회 정렬**(부분문자열 포함 시 더 구체적인 긴 키 우선). 현재 키는 상호 비충돌(충돌 위험 `조립식패널`쌍 제거됨):

```typescript
const SORTED_REFINE_ENTRIES = Object.entries(STRCT_ETC_REFINE)
  .sort(([a], [b]) => b.length - a.length);   // 길이 내림차순 1회(모듈 상수)

export function mapStructure(strctCd, etcStrct): StructureMapResult | null {
  const base = STRCT_CD_TO_KEY[strctCd];
  if (!base) return null;                       // ① 미수록 → null
  if (etcStrct) {
    const norm = etcStrct.replace(/\s/g, "").toLowerCase();   // 공백 제거 + 소문자
    for (const [key, fine] of SORTED_REFINE_ENTRIES) {
      // ★ 방향 확정: norm이 refine 키를 부분문자열로 "포함"(norm.includes(key)).
      //    예: norm="라멘조구조" ⊇ key="라멘조". 역방향(key.includes(norm)) 금지.
      if (norm.includes(key) && STRUCTURE_META[fine]) {
        return { structureKey: fine, confidence: "high" };    // ② refine 성공
      }
    }
  }
  return { structureKey: base, confidence: "medium" };        // ③ 대표값
}
```

> **substring 매칭 경계**(`feedback_enum_substring_match_forbidden` 인지): 현재 refine 키는 상호 비충돌(괄호형 충돌 위험 `조립식패널`쌍 제거 — 리뷰 M1). `wood` vs `wood_frame` 류 라벨 역인덱스 정규식 치환은 §2.2대로 금지(STRCT_ETC_REFINE 명시 키만). 향후 키 추가 시 부분문자열 충돌 여부 점검 + anchor 고정.
> **정밀도 상한**(draft §Z-1): coarse 코드 → 대표값 1개. fine 구분(연와조 95 vs 시멘트벽돌 90)은 etcStrct로만 → 대표값만이면 medium + "세부구조 확인" 안내.

### 2.4 동결 테이블 — 용도 (draft §A·§B)

```typescript
/** 앞2자리(별표1 호) → §A default. 단일값 동결(다값 병기 금지, plan §4.2). */
const PURPS_PREFIX_TO_USAGE: Readonly<Record<string, number>> = Object.freeze({
  "01": 2,   // 단독주택
  // "02" 공동주택 = 층수 derive(아래 mapUsage 특수분기, 표에 미수록)
  "03": 41,  // 제1종 근생
  "04": 41,  // 제2종 근생
  "05": 20,  // 문화·집회(전시/관람장은 §B override)
  "06": 23,  // 종교
  "07": 10,  // 판매(소매 default 단일 — plan §4.2 §Y실측 07000→#10 단일 동결. draft §A 다값표(도매12·소매10·상점11)는 §B override 분기 의미이지 default 다값 아님. 백화점#9·도매#12·상점#11은 PURPS_DETAIL_TO_USAGE override만)
  "08": 13,  // 운수
  "09": 27,  // 의료(종합병원#26은 §B)
  "10": 33,  // 교육연구(학원#32는 §B)
  "11": 34,  // 노유자(노인주거·경로당#35는 §B)
  "12": 36,  // 수련
  "13": 25,  // 운동(default 25 — 관람석≥1천㎡#22·골프장등#24는 §B)
  "14": 29,  // 업무(오피스텔#28은 §B)
  "15": 4,   // 숙박 default #4. 관광호텔#3은 등급부재 → override 미수록으로 자동도달 불가(§2.5 step 2)
  "16": 15,  // 위락(단란#17·유원#16·무도#14/18은 §B)
  "17": 48,  // 공장(지식산업센터#46·냉동/반도체#47은 §B)
  "18": 52,  // 창고(냉동/냉장#51은 §B)
  "19": 53,  // 위험물
  "20": 56,  // 자동차(주차장#57·매매/학원#55는 §B)
  "21": 59,  // 동식물(가축운동/실험#58·온실#60은 §B)
  "22": 54,  // 자원순환
  // "23" 교정·군사 = 미대응(국세청 미수록) → 표에 미수록 → null
  "24": 30,  // 방송통신
  "25": 50,  // 발전(원자력#49는 §B)
  "26": 42,  // 묘지(동물#43/45는 §B)
  "27": 31,  // 관광휴게
  // "28" 그밖에(야영장) = 미대응 → 표에 미수록 → null
});

/** 5자리 세부코드 override — 실측 9 확정분(draft §Z-2). 미확정 8행은 default 안전망(비차단). */
const PURPS_DETAIL_TO_USAGE: Readonly<Record<string, number>> = Object.freeze({
  // "03025"(목욕장)은 면적의존 → 아래 mapUsage 특수분기. 표에 미수록.
  "03005": 41,  // 의원
  "03002": 41,  // 휴게음식점
  "03008": 41,  // 변전소
  "04001": 41,  // 일반음식점
  "04402": 41,  // 사무소(근생)
  "13011": 25,  // 골프연습장
  "14299": 29,  // 기타일반업무
  "07999": 10,  // 기타판매
});

/** 면적의존 특수코드(목욕장 #37/#38/#39 — totArea 구간). draft §B-3·plan §7. */
const BATHHOUSE_DETAIL_CD = "03025";
```

### 2.5 `mapUsage` 구현 명세

```
0. year ∉ 2018~2026 → return null (scheme-60 외, plan §13)
1. prefix = mainPurpsCd.slice(0, 2)
2. 미대응 prefix 분기:
   - prefix === "23"(교정·군사) → null
   (호텔 등급류는 별도 null 분기 불요 — PURPS_DETAIL_TO_USAGE에 호텔 세부코드 미수록 +
    prefix 15 default가 #4이므로 #3 자동입력이 구조적으로 불가. plan §4.2 의도(등급 불명 시
    #3 자동입력 금지)는 "#4 default + 호텔 세부코드를 override 표에 미수록"으로 이미 충족.
    별도 가드 코드는 도달 불가 dead 분기 → 미작성, Simplicity)
3. 면적의존 분기: mainPurpsCd === "03025"(목욕장) →
   - totArea 미입력 → { usageNo: 41, confidence: "medium" } (대분류 fallback)
   - totArea ≥ 3000 → 37 / 1000~3000 → 38 / <1000 → 39, confidence "medium"
4. 5자리 override: PURPS_DETAIL_TO_USAGE[mainPurpsCd] 존재 →
   - { usageNo, confidence: "high" }
5. 공동주택 derive: prefix === "02" →
   - grndFlrCnt 미입력 → null (층수 없으면 #1/#2 판정 불가 → 수동)
   - grndFlrCnt ≥ 5 → { usageNo: 1, confidence: "high" } / else → { usageNo: 2, confidence: "high" }
6. 앞2자리 default: PURPS_PREFIX_TO_USAGE[prefix] 존재 →
   - { usageNo, confidence: "medium" }  (대분류 fallback)
7. 그 외(prefix 미수록 "28" 야영장 등) → null
```

> **연도 게이트 2중**: ① mapUsage 내부 year ∉ 2018~2026 → null(스킴 외). ② 호출부(UI 핸들러 §6.2)에서 결과 usageNo가 `listUsageOptions(year)`에 존재하는지 재검증(미존재 = 미채움) — `BuildingStdPriceForm.tsx:186`과 **동일 옵션셋** 검증(단 :186은 string 비교, §6.2는 number 비교 — d.usageNo가 number라 정합). mapUsage는 scheme-60 번호를 주므로 정상 연도면 항상 존재하나, 방어적 재검증.

> ★ **low confidence·잠정값 박기 금지**(plan §4.2·§7·`feedback_no_silent_apportion_fallback`): 채울 수 없는 셀(호텔 등급·교정·군사·prefix 부재)은 잠정 추정값 입력 금지 → `null`(미채움+안내). 호텔 #3(140) vs #4(130) 지수차로 침묵 과소 위험.

---

## 3. PNU 분해 헬퍼 — `pnu-building-register.ts` (③)

`pnu-sigungu.ts`는 `extractSigunguCodeFromPnu`(sigungu 5자리만, `:28`) 1개뿐 → bjdong/bun/ji/platGbCd 분해는 신규. 별도 파일(라우트 비대화 방지·단위 테스트 용이).

```typescript
/**
 * PNU(19자리) → 건축HUB getBrTitleInfo 파라미터.
 * PNU 구조: 시군구5 + 읍면동3 + 리2 + 산여부1 + 본번4 + 부번4 (pnu-sigungu.ts:4 주석).
 * platGbCd 변환: pnu[10]("1"=대지/"2"=산) → HUB platGbCd("0"=대지/"1"=산) (F6·F7).
 */
export interface BuildingRegisterPnuParts {
  sigunguCd: string;  // [0:5] 시군구코드
  bjdongCd: string;   // [5:10] 읍면동3 + 리2 통합 5자리(법정동코드)
  platGbCd: string;   // pnu[10]==="2" ? "1" : "0"  (산여부 1자리)
  bun: string;        // [11:15] 본번
  ji: string;         // [15:19] 부번
}

/** 19자리 PNU만 허용. 아니면 null(라우트가 400 안내). */
export function decomposePnuForBuildingRegister(
  pnu: string,
): BuildingRegisterPnuParts | null {
  if (!/^\d{19}$/.test(pnu)) return null;
  return {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    platGbCd: pnu[10] === "2" ? "1" : "0",   // 명시 분기(산술 트릭 금지, plan §4.3)
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19),
  };
}
```

> **platGbCd 명시 분기**(plan §4.3): `Number(pnu[10])-1` 산술 트릭 금지 — 코드값 체계 의존·silent 오매핑 위험. 2-case(대지/산)뿐이므로 명시 삼항.

---

## 4. API 프록시 라우트 — `route.ts` (②)

★ **템플릿 = `apt-trade/route.ts` 단독**(plan §3.3): env-graceful(configMissing)·User-Agent·resultCode "00"|"000". `standard-price`는 PNU 분해·`cache:"no-store"` 컨벤션만 참조(env-graceful 아님 — env 미설정 시 500).

> ⚠️ **apt-trade와의 1개 차이(맹목 복제 금지)**: apt-trade는 **XML** 파싱(`Accept: application/xml`, regex `<resultCode>` — `:280·302` 실측)이나 본 라우트는 `_type=json`(F4). JSON envelope의 resultCode 경로는 `json?.response?.header?.resultCode`로 읽는다(§4.3). 검증값("00"|"000")만 동일.
>
> ✅ **`header.resultCode` JSON 경로 검증 완료(2026-06 실측)**: 실 raw 확인 — `response.header` = `{"resultCode":"00","resultMsg":"NORMAL SERVICE"}`(키 실재), `response.body.items.item`은 다건 시 **배열**(역삼동 737 실측). §4.3의 `json?.response?.header?.resultCode` 경로·`Array.isArray(rawItem)` 분기 모두 정확. **이 항목 종결** — Do Phase 0 재확인 불요. (그래도 §4.3은 `resultCode &&` 가드로 방어 유지.)

### 4.1 응답 인터페이스 (연구 R2 — 신규 제안)

```typescript
/** 건축물대장 자동조회 응답 envelope. apt-trade RtmsAptTradeResponse 컨벤션 차용. */
export interface BuildingRegisterLookupResponse {
  success: boolean;
  /** 매핑 결과 — success 시에만 채움. 자동채움 대상 5필드. */
  data?: {
    structureKey: string | null;   // mapStructure 결과(미수록 = null)
    usageNo: number | null;        // mapUsage 결과(미대응 = null)
    confidence: RegisterMapConfidence | null;  // 구조·용도 중 낮은 등급(둘 다 채워질 때). 둘 다 null이면 null
    floorArea: number | null;      // totArea(㎡)
    builtYear: number | null;      // useAprDay.slice(0,4)
    floorsAbove: number | null;    // grndFlrCnt
    floorsBelow: number | null;    // ugrndFlrCnt
  };
  /** env 미설정 시 true — UI 버튼 비활성 판단용(apt-trade 동형). */
  configMissing?: boolean;
  /** 비차단 안내(매핑 불가·HUB 쿼터·resultCode 에러). throw 금지(plan §7). */
  warnings?: string[];
  /** 파라미터 검증 실패·치명 오류 메시지. */
  error?: string;
}
```

> **plan ↔ design 필드 추적**: plan §1.1·§2.1의 자동채움 핵심 5필드 = 구조·용도·연면적·신축연도·**층수(지상+지하 동반)**. design `data`의 7필드는 이 5필드를 전개한 것(층수 = `floorsAbove`+`floorsBelow`, 구조/용도에 confidence 1필드 동반). 폼에 `floorsBelow`(`:115`) 존재 → 동반 채움 정당, plan 핵심 5필드 범위 내.
> **confidence 합성 규칙**: 구조·용도 모두 채워지면 둘 중 낮은 등급(medium > high 우선순위 = medium 노출). 하나만 채워지면 그 등급. 둘 다 null이면 null. UI 배지는 `data.confidence === "medium"`일 때 노출.

### 4.2 GET 쿼리 검증 (apt-trade 패턴 그대로)

쿼리: `pnu`(19자리 필수) · `year`(4자리, 용도 연도 게이트). 검증 순서·응답 shape는 `apt-trade/route.ts:344-386` 그대로:

```typescript
export async function GET(
  request: NextRequest,
): Promise<NextResponse<BuildingRegisterLookupResponse>> {
  const { searchParams } = new URL(request.url);
  const pnu  = searchParams.get("pnu")?.trim()  ?? "";
  const year = searchParams.get("year")?.trim() ?? "";

  // ① env 미설정 — HTTP 200 + configMissing:true (apt-trade :345-353, 500 금지)
  const apiKey = process.env.MOLIT_RTMS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      configMissing: true,
      error: "MOLIT_RTMS_API_KEY가 설정되지 않았습니다.",
    });
  }

  // ② pnu 검증 — 19자리 숫자(apt-trade lawdCd 검증 :356-362 동형, HTTP 200 + success:false)
  const parts = decomposePnuForBuildingRegister(pnu);
  if (!parts) {
    return NextResponse.json({
      success: false,
      error: "pnu는 19자리 숫자이어야 합니다.",
    });
  }

  // ③ year 검증 — 4자리(용도 연도 게이트)
  const yearNum = parseInt(year, 10);
  if (!/^\d{4}$/.test(year) || Number.isNaN(yearNum)) {
    return NextResponse.json({
      success: false,
      error: "year는 4자리 연도이어야 합니다.",
    });
  }

  // ④ getBrTitleInfo 호출(1-call) → 매핑 → 정규화 응답 (§4.3)
  // ...
}
```

> apt-trade `RtmsAptTradeResponse`는 `records: []`를 항상 동반하나, 본 라우트는 records 개념이 없으므로 `data`/`warnings`만 사용(불필요 필드 미포함, Simplicity).

### 4.3 HUB 호출·파싱·resultCode (apt-trade fetch 패턴 차용)

```typescript
// getBrTitleInfo 호출
// F2 동결 7파라미터만 — 단건 표제부 조회는 페이지네이션(numOfRows/pageNo) 불요.
const qs = new URLSearchParams({
  serviceKey: apiKey,
  sigunguCd: parts.sigunguCd,
  bjdongCd: parts.bjdongCd,
  platGbCd: parts.platGbCd,
  bun: parts.bun,
  ji: parts.ji,
  _type: "json",
});
const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

let res: Response;
try {
  res = await fetch(`${BASE}?${qs}`, {
    cache: "no-store",  // standard-price·apt-trade 컨벤션
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },  // UA 무해(F5)
  });
} catch (err) {
  return NextResponse.json({ success: false, warnings: [`건축물대장 조회 네트워크 오류: ${String(err)}`] });
}
if (!res.ok) {
  return NextResponse.json({ success: false, warnings: [`건축물대장 HTTP ${res.status}`] });
}
const json = await res.json();

// resultCode 검증 — apt-trade :302-310 동형("00"|"000" 성공). _type=json 경로는 envelope 객체.
const header = json?.response?.header;
const resultCode = String(header?.resultCode ?? "").trim();
if (resultCode && resultCode !== "00" && resultCode !== "000") {
  // 쿼터/미승인/무결과 → 200 + warnings(throw 금지, plan §7)
  return NextResponse.json({
    success: false,
    warnings: [`건축물대장 API 오류: ${resultCode} — ${header?.resultMsg ?? ""}`],
  });
}

// envelope: response.body.items.item (F4 — 단건 객체 / 다건 배열)
const rawItem = json?.response?.body?.items?.item;
const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;
if (!item) {
  return NextResponse.json({ success: false, warnings: ["해당 소재지의 건축물대장 표제부를 찾을 수 없습니다."] });
}
```

### 4.4 필드 추출 + 매핑 적용 → data 조립

```typescript
const strctCd = String(item.strctCd ?? "").trim();
const etcStrct = item.etcStrct ? String(item.etcStrct).trim() : undefined;
const mainPurpsCd = String(item.mainPurpsCd ?? "").trim();
const grndFlrCnt = toIntOrUndef(item.grndFlrCnt);
const ugrndFlrCnt = toIntOrUndef(item.ugrndFlrCnt);
const totArea = toFloatOrUndef(item.totArea);
const useAprDay = String(item.useAprDay ?? "").trim();  // YYYYMMDD

const structResult = mapStructure(strctCd, etcStrct);
const usageResult = mapUsage(mainPurpsCd, grndFlrCnt, totArea, yearNum);

const warnings: string[] = [];
if (!structResult) warnings.push("건물 구조를 대장에서 매핑할 수 없습니다(직접 선택).");
if (!usageResult)  warnings.push("건물 용도를 대장에서 매핑할 수 없습니다(직접 선택).");

const confidence: RegisterMapConfidence | null =
  structResult && usageResult
    ? (structResult.confidence === "medium" || usageResult.confidence === "medium" ? "medium" : "high")
    : (structResult?.confidence ?? usageResult?.confidence ?? null);

return NextResponse.json({
  success: true,
  data: {
    structureKey: structResult?.structureKey ?? null,
    usageNo: usageResult?.usageNo ?? null,
    confidence,
    floorArea: totArea ?? null,
    builtYear: useAprDay.length >= 4 ? parseInt(useAprDay.slice(0, 4), 10) : null,
    floorsAbove: grndFlrCnt ?? null,
    floorsBelow: ugrndFlrCnt ?? null,
  },
  ...(warnings.length > 0 ? { warnings } : {}),
});
```

> `toIntOrUndef`/`toFloatOrUndef` = 라우트 내부 소형 헬퍼(NaN·빈문자 → undefined). HUB는 숫자도 문자열로 반환(`strctCd`·`grndFlrCnt` 모두 string).

---

## 5. 폼 `pnu` 보존 (④a·④b)

### 5.1 `building-std-price-form.ts` (④a)

`BuildingStdPriceFormState` 소재지 그룹(`:123-129`)에 추가:

```typescript
  // 소재지(개별공시지가 조회용 — 엔진 입력 아님)
  addressRoad: string;
  addressJibun: string;
  buildingName: string;
  addressDetail: string;
  longitude: string;
  latitude: string;
  pnu: string;            // ★신규 — 건축물대장 조회 파라미터 소스(엔진 미전달, longitude/latitude 성격 동일)
```

`initialBuildingStdPriceForm`(`:188-238`, latitude `:206` 직후 소재지 블록)에 `pnu: ""` 추가.

> **normalize·validation = N/A 확정**(plan §6·§9.3): 폼은 `useState` 직접 초기화(`BuildingStdPriceForm.tsx:127`), zustand normalize 파이프라인 부재. 영속은 `building-std-snapshot-store`(raw 저장). 복원 시 `initialBuildingStdPriceForm.pnu:""` 기본 spread(`:128-143`)가 구버전 스냅샷 누락 키 채움 → 무해. `validateBuildingStdPriceForm`은 소재지 필드 일절 미검증(`:480-601`) → `pnu` 비검증.

### 5.2 `BuildingStdPriceForm.tsx` AddressSearch value·onChange (④b)

★ **양방향 round-trip 필수** — value·onChange **둘 다** pnu를 다뤄야 보존된다. AddressSearch 내부 편집 경로(`handleDetailChange:188`·`onDongChange:343`·`onHoChange:351`)는 모두 `onChange({ ...value, ... })`로 **현재 `value` prop을 spread**한다. `value`에 pnu가 없으면 이 spread 결과에 pnu가 빠지고 → 폼 onChange의 `pnu: v.pnu ?? ""`가 빈 문자열로 덮어써 → **주소 선택 후 상세/동/호를 건드리는 순간 pnu 소실 → 조회 버튼 비활성**. `handleSelect:175-183`만 pnu를 직접 emit하므로 value 누락 시 신규 선택은 살아남지만 후속 편집에서 죽는다. `longitude`/`latitude`가 이미 value·onChange 양쪽에 다 있는 것과 동형으로 pnu도 양쪽 처리.

**① value 블록(`:306-314`)에 `pnu: f.pnu` 추가**:

```typescript
value={
  {
    road: f.addressRoad,
    jibun: f.addressJibun,
    building: f.buildingName,
    detail: f.addressDetail,
    lng: f.longitude,
    lat: f.latitude,
    pnu: f.pnu,            // ★신규 — round-trip(내부 ...value spread가 pnu 보존)
  } satisfies AddressValue
}
```

**② onChange 블록(`:316-326`)에 `pnu: v.pnu ?? ""` 추가** (현재 버려짐 — `AddressValue.pnu?` 존재하나 미매핑):

```typescript
onChange={(v) =>
  setF((prev) => ({
    ...prev,
    addressRoad: v.road,
    addressJibun: v.jibun,
    buildingName: v.building,
    addressDetail: v.detail,
    longitude: v.lng,
    latitude: v.lat,
    pnu: v.pnu ?? "",       // ★신규
  }))
}
```

**③ initialAddress 복원(`:131-140`)에도 `pnu: initialAddress.pnu ?? ""` 추가**(`AddressValue.pnu?` 존재 — `address-search.tsx:29`). `BuildingStdPriceModalButton`이 `initialAddress?: AddressValue`(`:28`)를 전달하므로 pnu가 있으면 모달 진입 시 즉시 조회 가능.

---

## 6. UI 조회 버튼 — `BuildingRegisterLookupField.tsx` (⑤)

`LandPriceLookupField` 동형(로컬 state + fetch + 다필드 patch). 모달 아님(건물 1건 = 선택 단계 불요, plan §4.5).

### 6.1 Props·로컬 state

```typescript
export interface BuildingRegisterLookupFieldProps {
  /** PNU(19자리) — 조회 활성화 조건 */
  pnu: string;
  /** 자동채움 대상 연도(양도=transferYear, 상증=valuationYear). 미입력 시 버튼 비활성 */
  year: string;
  /** 자동채움 대상 시점 — patch 키 분기 결정(plan §4.5: 양도시점·상증만) */
  taxType: BuildingStdPriceTaxType;
  /** 다필드 patch — setF 직접 주입(LandPriceLookupField onPricePerSqmChange 대비 다필드) */
  onAutoFill: (patch: Partial<BuildingStdPriceFormState>) => void;
  /** 비활성 가드 — 3모드(compositeMode || isMechanicalParking || apartmentConversionMode)는
   *  부모(BuildingStdPriceForm)가 계산해 주입. pnu·year 미입력·isLookingUp 비활성은 컴포넌트
   *  내부 판단(§6.2 `if (!pnu || !year || disabled) return`). 책임 분리. (plan §4.5·F11) */
  disabled: boolean;
  disabledReason?: string;
}
```

> **disabled 책임 분리**: 3모드 가드(plan §4.5)는 부모가 `f.compositeMode || f.isMechanicalParking || apartmentConv`로 계산해 `disabled` prop으로 주입한다. pnu/year 빈값·진행중(isLookingUp) 비활성은 컴포넌트 내부에서 판단해 버튼 `disabled` 속성과 핸들러 early-return에 함께 반영(plan §4.5 disabled 식 `!f.pnu || compositeMode || ... || !시점연도 || isLookingUp`을 prop+내부로 분할).

로컬 state(`useState`): `isLookingUp: boolean` · `lookupError: string | null` · `summary: string | null` · `confidence: RegisterMapConfidence | null`.

### 6.2 조회 핸들러 — 시점별 patch 분기 (plan §4.5)

```typescript
async function handleLookup() {
  if (!pnu || !year || disabled) return;
  setIsLookingUp(true); setLookupError(null); setSummary(null);
  try {
    const res = await fetch(`/api/address/building-register?pnu=${pnu}&year=${year}`);
    const json: BuildingRegisterLookupResponse = await res.json();
    if (json.configMissing) { setLookupError("건축물대장 API 미설정 — 직접 입력하세요."); return; }
    if (!json.success || !json.data) {
      setLookupError(json.warnings?.[0] ?? json.error ?? "조회 실패"); return;
    }
    const d = json.data;
    const yearNum = parseInt(year, 10);

    // 시점별 구조/용도 키 결정(plan §4.5 — 취득시점 acq* 미채움)
    const patch: Partial<BuildingStdPriceFormState> = {};
    // 공통(시점 무관) — 항상 채움
    if (d.floorArea !== null)    patch.floorArea = String(d.floorArea);
    if (d.builtYear !== null)    patch.builtYear = String(d.builtYear);
    if (d.floorsAbove !== null)  patch.floorsAbove = String(d.floorsAbove);
    if (d.floorsBelow !== null)  patch.floorsBelow = String(d.floorsBelow);

    // 구조 — 시점 옵션셋 검증 후 set(연도 무관 채움)
    const structOk = d.structureKey
      && listStructureOptions(yearNum).some((o) => o.key === d.structureKey);
    // 용도 — 동일 listUsageOptions(year) 옵션셋 검증(미존재 = 미채움).
    //   기존 가드 BuildingStdPriceForm.tsx:186은 String(o.no)===f[usageKey] string 비교,
    //   본 핸들러는 d.usageNo가 number라 o.no===d.usageNo number 비교 — 같은 옵션셋·다른 타입축(정합).
    const usageOk = d.usageNo !== null
      && listUsageOptions(yearNum).some((o) => o.no === d.usageNo);

    if (taxType === "inheritance_gift") {
      if (structOk) patch.valStructureKey = d.structureKey!;
      if (usageOk)  patch.valUsageNo = String(d.usageNo);
    } else {
      if (structOk) patch.transStructureKey = d.structureKey!;
      if (usageOk)  patch.transUsageNo = String(d.usageNo);
    }

    onAutoFill(patch);            // 무확인 덮어쓰기(F12) — 단일 patch
    setConfidence(d.confidence);
    setSummary(buildSummary(d, structOk, usageOk, json.warnings));  // "○○구조 · ○○용도 · 연면적…"
  } catch {
    setLookupError("네트워크 오류");
  } finally {
    setIsLookingUp(false);
  }
}
```

> **취득시점 미채움 단정**(plan §4.5·F10): 대장 = 현재 상태 1벌 → 증축·용도변경 이력 침묵 반영 numeric 위험. `acqStructureKey`/`acqUsageNo` 수동 유지.
> **연도 변경 가드 우회 안 함**(plan §5 Phase 4): 자동채움 patch는 `changeYearWithGuard`(`:177-193`) 경로를 안 거치는 별도 patch. 자동채움 후 사용자가 시점 연도를 옵션셋에 없는 연도로 바꾸면 기존 가드(`:185-191` structOk/usageOk)대로 구조/용도 클리어. 자동채움이 가드를 우회하지 않음.

### 6.3 배치·활성화 가드·표시

- **배치**: rose 소재지 카드 div(`BuildingStdPriceForm.tsx:294-329`) **내부**, `AddressSearch` JSX(`</AddressSearch>` `:327`) **다음 형제**로 배치(카드 div `:328` 닫힘 전). 래퍼는 **bare div**(FieldCard 아님 — 단일 버튼+요약 1행이라 좌-라벨 슬롯 불요. LandPriceLookupField는 FieldCard를 내부에 쓰나 본 버튼은 더 단순). `disabled` = `f.compositeMode || f.isMechanicalParking || apartmentConv`(`:230` `apartmentConv` 파생 재사용).
- **year prop**: 양도 = `f.transferYear`, 상증 = `f.valuationYear`. 빈값이면 버튼 내부 `!year` 비활성.
- **버튼 스타일**: `LandPriceLookupField:167-174` 버튼 클래스 동형(`h-9 shrink-0 rounded-md border ... disabled:opacity-40`).
- **결과 요약**: 조회 성공 시 "○○구조 · ○○용도 · 연면적 ○○㎡ · ○○년 신축 자동 입력됨" + medium 배지(`d.confidence === "medium"`). 매핑 불가 필드는 요약에서 "직접 선택" 안내. 에러 = `text-destructive` 한국어(`:177` 동형).
- **용도 연도 미지원 안내(과거연도)**: `d.usageNo === null`이고 시점 연도가 2018 미만이면, 용도가 매핑 불가가 아니라 **scheme 외 연도**임을 구분 안내("용도는 2018년 이후 평가만 자동 지원 — 직접 선택"). 구조·연면적·연도·층수는 채워지므로(부분 채움) 용도만 빈 칸인 사유를 사용자에게 명시. (route warnings는 §4.4에서 "용도 매핑 불가" 단일 메시지를 주므로, year < 2018 사유 구분은 UI 핸들러에서 `parseInt(year,10) < 2018` 분기로 요약 메시지를 보강.)
- **medium 배지**: `LandPriceLookupField`의 `yearBadge`(`:121-138`) 패턴 차용 — `rounded bg-amber-100 px-1.5 py-0.5 text-[10px] ... text-amber-700` "확인 권장".

> **무확인 덮어쓰기 + 요약**(F12·plan §7): confirm 분기 없음. 버튼 클릭 = 동의. "자동 입력됨" 요약으로 침묵 아님 명시.
> **배지 제거**: `summary`/`confidence`는 다음 조회 또는 사용자가 구조/용도 Select를 직접 변경할 때까지 유지. plan §4.1의 "수정 시 배지 제거"는 요약 영역 자체가 별도 표시이므로, 구조/용도 Select 직접 변경 시 summary를 자동 클리어할 필요 없음(요약은 "마지막 조회 결과" 표시). MVP는 summary 상시 표시 — 별도 dirty 추적 불요(Simplicity). (plan §4.1 autoFilledFields Set은 over-engineering으로 비채택 — 요약 텍스트로 충분.)

---

## 7. 케이스 매트릭스 (전수 enumerate — 자가 점검)

### 7.1 구조 (mapStructure)

| strctCd | etcStrct | 결과 | confidence | 근거 |
|---|---|---|---|---|
| "21" | (any/none) | `rc` | medium | 대표(refine 없음) |
| "21" | "라멘조" | `ramen` | high | refine |
| "42" | "철골철근콘크리트조" | `steel_frame_rc` | medium | 대표(별칭 미매칭 — 라벨=괄호형, ✅실측은 대표로 충분) |
| "11" | (none) | `brick` | medium | 대표 |
| "11" | "시멘트벽돌" | `cement_brick` | high | refine |
| "51" | "목조" | `wood` | medium→high* | *base가 wood, refine 키에 "목조" 없음 → medium |
| "51" | "통나무" | `solid_wood` | high | refine |
| "51" | "경량목구조" | `wood_frame` | high | refine |
| "99" | (any) | **null** | — | 미수록 |

> *"51"+"목조": base="wood", refine 테이블에 "목조" 키 없음(있으면 자기 자신) → 대표값 medium. anchor는 `mapStructure("51","목조").structureKey === "wood"` 확인, confidence는 "medium"(plan §8.1의 "≠wood_frame" 회귀 가드 핵심은 키이지 등급 아님).

### 7.2 용도 (mapUsage)

| mainPurpsCd | grndFlrCnt | totArea | year | 결과 usageNo | confidence | 근거 |
|---|---|---|---|---|---|---|
| "14000" | — | — | 2023 | 29 | medium | prefix 14 default |
| "02000" | 14 | — | 2023 | 1 | high | 공동주택 층수 derive(≥5) |
| "02000" | 4 | — | 2023 | 2 | high | 층수 derive(≤4) |
| "02000" | undefined | — | 2023 | **null** | — | 층수 없음 → 판정 불가 |
| "07000" | — | — | 2023 | 10 | medium | prefix 07 default |
| "07999" | — | — | 2023 | 10 | high | §B override |
| "03005" | — | — | 2023 | 41 | high | §B override(의원) |
| "03025" | — | 5000 | 2023 | 37 | medium | 목욕장 면적의존 ≥3000 |
| "03025" | — | 2000 | 2023 | 38 | medium | 1000~3000 |
| "03025" | — | 500 | 2023 | 39 | medium | <1000 |
| "03025" | — | undefined | 2023 | 41 | medium | totArea 없음 → 대분류 fallback |
| "23010" | — | — | 2023 | **null** | — | 교정·군사 미대응 |
| "28000" | — | — | 2023 | **null** | — | prefix "28" 미수록 |
| "14000" | — | — | 2010 | **null** | — | year ∉ 2018~2026 |

### 7.3 라우트·UI 가드

| 케이스 | 응답/동작 |
|---|---|
| env 미설정 | `{success:false, configMissing:true}` → 버튼 안내 "미설정" |
| pnu 비19자리 | `{success:false, error}` (HTTP 200) |
| year 비4자리 | `{success:false, error}` |
| HUB resultCode≠"00"/"000" | `{success:false, warnings:[...]}` → 버튼 안내(throw 금지) |
| item 부재 | `{success:false, warnings:["표제부 없음"]}` |
| 구조 null·용도 채움 | `data.structureKey=null` + warnings + 용도만 patch |
| 양도시점 자동채움 | `transStructureKey`/`transUsageNo`만 set, `acq*` 미채움 |
| 상증 자동채움 | `valStructureKey`/`valUsageNo` set |
| compositeMode/mech/apartmentConv ON | 버튼 disabled + disabledReason |
| 자동채움 후 연도 변경(옵션 불일치) | 기존 `changeYearWithGuard` 가드대로 구조/용도 클리어 |

---

## 8. 테스트 목록

### 8.1 anchor — `__tests__/tax-engine/building-standard-price/building-register-map.test.ts` (T1a, vitest)

```
describe mapStructure:
  - mapStructure("42","철골철근콘크리트조").structureKey === "steel_frame_rc"   [강남파이낸스·롯데]
  - mapStructure("21","철근콘크리트조").structureKey === "rc"                    [은마]
  - mapStructure("21",undefined) → { structureKey:"rc", confidence:"medium" }
  - mapStructure("21","라멘조").structureKey === "ramen"  (confidence "high")
  - mapStructure("11",undefined) → { structureKey:"brick", confidence:"medium" }
  - mapStructure("11","시멘트벽돌") → { structureKey:"cement_brick", confidence:"high" }
  - mapStructure("51","목조").structureKey === "wood"   ★≠wood_frame 회귀 가드(plan §3.4)
  - mapStructure("51","통나무").structureKey === "solid_wood"
  - mapStructure("51","경량목구조").structureKey === "wood_frame"
  - mapStructure("99",undefined) === null
  - [별칭 정규식 금지 가드] mapStructure("51","목구조").structureKey === "wood"
      (refine 키에 "목구조" 없음 → 대표 wood, wood_frame로 오매핑 금지 — 라벨 역인덱스 정규식 부재 증명)

describe mapUsage:
  - mapUsage("14000",undefined,undefined,2023) → { usageNo:29, confidence:"medium" }   [강남파이낸스]
  - mapUsage("02000",14,undefined,2023) → { usageNo:1, confidence:"high" }              [은마 층수 derive]
  - mapUsage("02000",4,undefined,2023).usageNo === 2
  - mapUsage("02000",undefined,undefined,2023) === null
  - mapUsage("07000",undefined,undefined,2023) → { usageNo:10, confidence:"medium" }    [롯데/코엑스 판매 default]
  - mapUsage("07999",undefined,undefined,2023) → { usageNo:10, confidence:"high" }
  - mapUsage("03005",undefined,undefined,2023) → { usageNo:41, confidence:"high" }       [의원]
  - mapUsage("03025",undefined,5000,2023).usageNo === 37   [목욕장 ≥3000]
  - mapUsage("03025",undefined,2000,2023).usageNo === 38
  - mapUsage("03025",undefined,500,2023).usageNo === 39
  - mapUsage("03025",undefined,undefined,2023).usageNo === 41   [목욕장 면적 없음 fallback]
  - mapUsage("23010",undefined,undefined,2023) === null         [교정·군사]
  - mapUsage("28000",undefined,undefined,2023) === null         [prefix 미수록]
  - mapUsage("14000",undefined,undefined,2010) === null         [year 게이트 ∉ 2018~2026]
  - [scheme-60 존재 가드] mapUsage 결과 usageNo는 listUsageOptions(2023)에 존재
```

### 8.2 PNU 분해 — `__tests__/tax-engine/building-standard-price/pnu-building-register.test.ts` (T1b, vitest)

```
- decompose 19자리 대지(pnu[10]="1") → { platGbCd:"0", sigunguCd:[0:5], ... }
- decompose 19자리 산(pnu[10]="2") → { platGbCd:"1" }   ★산 케이스(plan §9.1 표본 무관 검증)
- decompose 18자리 → null
- decompose 비숫자 → null
```

### 8.3 E2E — `building-register-autofill.spec.ts` (T2, Playwright)

```
- mock /api/address/building-register 성공 → "건축물대장 조회" 클릭 →
    구조·용도·floorArea·builtYear·floorsAbove/Below 채워짐 → 계산 완료
- medium confidence 배지 노출
- compositeMode·isMechanicalParking·apartmentConversionMode 토글 ON 각각 → 버튼 disabled (3 모드 전부)
- configMissing mock → 버튼 안내
- 자동채움(양도시점) 후 transferYear를 옵션셋 없는 연도로 변경 → 기존 가드대로 구조/용도 클리어,
    취득시점 필드는 수동 유지(미채움) 확인
- 회귀: 기존 building-std-price E2E green(baseline 대조)
```

> 정책: 브라우저 확인은 Playwright(`feedback_browser_verify_with_playwright`). 차단 validation 신규 0 → 전체 세목 E2E 회귀 불요(자동채움 비차단, plan §8.2).

---

## 9. 14 동기화 지점 점검 (엔진 필드 0 — 대부분 N/A)

| # | 지점 | 본 기능 |
|---|---|---|
| ① 폼 상태 | `BuildingStdPriceFormState`에 `pnu: string` | ✅ §5.1 |
| ② initial | `initialBuildingStdPriceForm`에 `pnu: ""` | ✅ §5.1 |
| ③ normalize | **N/A** — 폼 normalize 파이프라인 부재(`useState` 직접). spread 기본값으로 무해 | §5.1 |
| ④ API 변환 | **N/A** — `pnu`는 엔진 미전달. `toEngineInput` 무변경 | — |
| ⑤ UI 위젯 | `BuildingRegisterLookupField` + AddressSearch onChange | ✅ §5.2·§6 |
| ⑥ 사이드바 | **N/A** — `pnu`는 합계 무관 | — |
| ⑦ 결과 카드 | **N/A** — 엔진 result 무변경 | — |
| ⑧ validation | **N/A** — `validateBuildingStdPriceForm` 소재지 미검증(`pnu` 비검증 확정) | §5.1 |
| ⑨~⑭ Zod/Route/body | **N/A** — calc 라우트 아님(프록시). Zod 미사용 수동 검증. 엔진 input 매핑 무관 | §4.2 |

> 신규 라우트는 **프록시**(apt-trade·standard-price 계열) — calc 라우트의 14지점 체계와 무관. 자동채움은 기존 폼 필드에 `setF`로 값을 쓸 뿐.

---

## 10. 설계 결정 요약 (plan §9.2 단정 인용)

| 결정 | 값 | 근거 |
|---|---|---|
| 양도 2시점 적용 | 시점 분리 필드(`*StructureKey`·`*UsageNo`)만 양도시점(`trans*`)·상증(`val*`) 한정, 취득시점(`acq*`) 미채움 | 대장=현재 단일 스냅샷, 변경 이력 침묵 numeric 위험 |
| 공통 필드 채움 | `floorArea`·`builtYear`·`floorsAbove`·`floorsBelow`는 폼 **단일 필드**(시점 분리 없음) → 취득시점 미채움 원칙 무관, 항상 채움 | 폼에 시점별 면적/연도/층수 분리 필드 부재(§5.1) |
| 덮어쓰기 정책 | 무확인 덮어쓰기 + "자동 입력됨" 요약 | 명시 버튼 클릭=동의, 형제 LandPriceLookupField 동형 |
| confidence 등급 | high\|medium 2-등급(low 제거) | 호텔 등급류는 잠정값 박기 대신 null(제외) |
| 미대응 처리 | null(미채움+안내) | 교정·군사·prefix 부재·호텔 등급부재 단일 처리 |
| 모달 vs 인라인 | 인라인 버튼 | 건물 1건=선택 단계 불요, history-lookup-modal 부적합 |
| PNU 분해 위치 | 신규 별도 파일 | pnu-sigungu.ts는 sigungu만, 라우트 비대화 방지·단위 테스트 |
| 캐시·rate-limit | 미적용 | address 프록시 계열 일관성(Simplicity) |
