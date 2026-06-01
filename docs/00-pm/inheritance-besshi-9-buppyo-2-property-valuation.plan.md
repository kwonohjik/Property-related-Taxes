# 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」 — 화면·PDF 재현 계획서

> 2026-06-01 · feature: `inheritance-besshi-9-buppyo-2-property-valuation`
> 선행: 별지 제9호서식(앞쪽) `filing-form-9` 완료(`7953490`·`0187183`) / 증여 부표1 `GiftTaxValuationFormTable` / 부표1 재산코드 정합(`inheritance-besshi-9-buppyo-1-property-code-alignment`)
> 소관: `inheritance-gift-tax-senior`(엔진·데이터 §2) · `inheritance-gift-tax-ui-senior`(UI·PDF §3)
> 근거 검증: KoreanLaw MCP `get_annexes`(상속세 및 증여세법 시행규칙 별지 제9호서식 부표 2, **개정 2024.3.22.**) — 본 계획서 모든 양식 칸은 이 본문 1:1 전사

---

## 0. 사전 결정 사항 (사용자 인터뷰 2026-06-01)

| # | 결정 항목 | 결정 |
|---|---|---|
| D-1 | 양식 정체 | **별지 제9호서식 부표 2** 1종. 첨부 이미지1=「가·나 평가명세」, 이미지2=「상속인별 명세」 (한 양식의 두 부분) |
| D-2 | 상속인별 출력 | **상속인 수만큼 N장** — 각 장 = 해당 상속인 몫만 (부표 2 의 본래 설계: 가 섹션 데이터행 1 = 상속인 1명) |
| D-3 | 산출물 | **화면 토글 + PDF 다운로드** 둘 다 (별지 제9호서식 패턴 동일) |
| D-4 | 데이터 정책 | **엔진 변경 0** — 기존 `InheritanceTaxResult`·`EstateItem` 으로 채우고, 미수집 칸(단가·취득일·주민번호·국외 소재지 등)은 **공란/자동도출** |
| D-5 | 레이아웃 | **A4 가로(landscape)** + 하단 **가로 스크롤바**(`HorizontalScrollContainer`) — 증여세 보고서 양식 패턴 (사용자 명시) |

**정책 준수 사전 점검** (memory):
- `feedback_no_silent_apportion_fallback` — 협의분할 미입력 자산의 개별 행 자동 안분 **금지** (§2-4)
- `feedback_macos_scrollbar_autohide_workaround` — 가로 스크롤은 `HorizontalScrollContainer` 강제 (§3-2)
- `feedback_korean_law_citation_verify` / `enum-verification-before-mapping` — 재산종류·평가기준 코드 라벨은 KoreanLaw 검증 표 **단일 출처** (§2-3, C-1)
- `feedback_no_internal_id_in_result` — 자산명 미입력 시 카테고리 한글 라벨 fallback, 내부 id 노출 금지 (§3-1)

---

## 1. 목표·범위·선례

### 1-1. 목표
상속세 계산 결과 화면에서, 입력된 상속인·상속재산을 기준으로 **별지 제9호서식 부표 2「상속인별 상속재산 및 평가명세서」를 각 상속인별 1장씩(N장)** 화면 표시 + PDF 다운로드한다. 공식 양식 칸 구조와 1:1 정합(이미지1·2와 100% 동일), 미수집 칸은 공란.

### 1-2. 공식 양식 구조 (KoreanLaw 검증 본문 전사)

**[별지 제9호서식 부표 2] 상속인별 상속재산 및 평가명세서 (개정 2024.3.22.) (앞쪽)**

- **가. 상속인별 상속현황** (헤더 + 데이터행 1):
  `피상속인과의 관계 | 성명 | 주민등록번호 | 주소 | 법정상속지분율 | 법정상속재산가액 | 실제상속지분율 | 실제상속재산가액`
- **나. 상속인별 상속재산명세** (데이터행 8):
  `재산구분코드 | 재산종류코드 | ⑪소재지·법인명등(+국외자산여부 [ ]여[ ]부 · 국외재산 국가명) | 사업자등록번호(계좌번호,지분) | 수량(면적) | 단가 | 평가가액 | 평가기준코드`
- **계** (12행):
  `상속재산가액 | 상속개시 전 처분재산등 산입액 | 비과세재산가액(금양임야 등·공공단체 유증·기타) | 과세가액불산입액(공익법인 출연재산·공익신탁 재산·기타) | 가산하는 증여재산가액(상증법§13·조특§30의5·조특§30의6) | 합계`

**작성방법 핵심**:
1. 피상속인과의 관계 = 상속인 기준("자")
2. 법정상속지분율 = 해당 상속인 지분 ÷ 총상속지분
3. 법정상속재산가액 = (부표1 ⑫총상속재산가액 합계 + 가산증여재산) − (상속인外 수유자 유증재산 + 비과세재산 계 + 공과금 + 채무) × 법정상속지분율
4. 실제상속지분율 = 실제상속재산가액 ÷ 총상속재산가액
5. 실제상속재산가액 = 협의분할로 실제 취득한 금액 (협의분할서 첨부)
6. 사업자등록번호(지분)란 = 부동산은 "해당 상속인의 실제 상속지분"

**코드표** (부표1과 공유 — KoreanLaw 검증):
- 재산구분코드 12종: A11(상속재산-상속인)/A12(상속재산-상속인 외)/A13(상속개시전 처분재산)/A21(증여가산-상속인)/A22(증여가산-상속인 외)/A23(창업자금)/A24(가업승계)/B11(금양임야)/B12(공공단체유증)/B13(비과세기타)/B21(공익법인출연)/B22(공익신탁)
- 재산종류코드 14종: 01현금/02토지I(순수토지)/03토지II(일반건물 부수토지)/04개별주택/05공동주택/06오피스텔·상업용건물/07일반건물/08부동산취득권리/09유가증권(상장)/10유가증권(비상장)/11금융재산/12기타재산/13가상자산/14서화·골동품
- 평가기준코드 8종: 01매매거래가액(§60)/02감정가액(§60)/03수용보상가액(§60)/04경매공매가액(§60)/05유사매매사례가액(§60)/06현금등가액(§60)/07저당권등평가특례(§66)/08기준시가등보충적평가(§61~65)

### 1-3. 선례·재사용 자산 (실측)

| 용도 | 파일 | 재사용 방식 |
|---|---|---|
| 데이터 어댑터 패턴 | `lib/calc/filing-form-9-data.ts` | `buildBuppyo2Data` 가 동일하게 result + 집계만 읽는 단일 게이트웨이 |
| 관계 라벨 맵 | `lib/calc/filing-form-9-data.ts` `HEIR_RELATION_TO_DECLARANT_LABEL` | spouse/child/legatee/corporate 라벨 재사용 |
| A4 가로 양식 + 가로 스크롤 | `components/calc/results/GiftTaxResultView.tsx` L346~359 + `GiftTaxValuationFormTable.tsx` | `<HorizontalScrollContainer>` + `<colgroup>` mm 폭 패턴 복제 |
| 가로 스크롤 공용 | `components/calc/shared/HorizontalScrollContainer.tsx` | 그대로 사용 (print:overflow-visible 내장) |
| 화면 토글 + PDF 버튼 | `components/calc/inheritance/filing-form-9/{FilingForm9CoverSection,FilingForm9PdfDownloadButton}.tsx` | open 토글 + `hidden print:block` + dynamic ssr:false 패턴 복제 |
| 재산종류·평가기준 코드 매핑 | `GiftTaxValuationFormTable.tsx` private `toPropertyTypeCode`/`toValuationMethodCode` | **공유 모듈로 추출**(§2-3) 후 부표1·부표2 공유 |
| 재산구분코드(증여) | `components/calc/results/inheritance-filing-form-helpers.ts` `inferPropertyKindCode` | 사전증여 A21~A24 분기 재사용 + 본래상속 A11/A12 신규 함수 추가 |
| 금액 칸 정렬 | `components/calc/results/shared/BesshiRow.tsx` (`BesshiColumn`) | `font-mono tabular-nums text-right` |
| PDF 글리프 fallback | `lib/pdf/besshi-pdf-styles.ts` | `fontFamily` 배열 per-glyph (NanumGothic+IBM Plex Sans KR) |
| 마운트 | `components/calc/results/InheritanceTaxResultView.tsx` L335 (`FilingForm9CoverSection`) | 바로 다음에 부표2 섹션 추가. `heirs`·`estateItems`·`deathDate` prop 이미 존재 |

---

## 2. 엔진·데이터 어댑터 (엔진 변경 0)

> 작성: `inheritance-gift-tax-senior` (실측). 소스: `lib/tax-engine/types/inheritance-allocation-result.types.ts` L16-84(`HeirTaxBreakdown`) · `lib/tax-engine/inheritance-legal-share.ts` L17-27 · `lib/tax-engine/types/inheritance-gift.types.ts` L970-1052.

### 2-1. perHeir 필드 인벤토리 (실측 결론)

**법정상속분은 `perHeir`에 미노출** — `computeLegalShares(heirs)`(**`inheritance-legal-share.ts:33` `export function`** — 실측 정정, 기존 "inheritance-allocation.ts L352"는 호출처)에서 중간값으로만 계산. 어댑터에서 `heirs`로 재호출하여 도출.

| 부표 2 항목 | 소스 | 분류 | 비고 |
|---|---|---|---|
| 가. 법정상속지분율 | `computeLegalShares(heirs)` 분자/분모 | (b) 도출 | legatee·corporate 제외 → 공란 |
| 가. 법정상속재산가액 | 작성방법 #3 산식 (도출) | (b) 도출 | §2-6 R-1 정합 확정 후 진입 |
| 가. 실제상속지분율 | `grossInheritance ÷ Σgross` | (b) 도출 | |
| 가. 실제상속재산가액 | `perHeir[id].grossInheritance` (L63) | (a) 직접 | 채무공제 전 자산 합계 |
| 계. 상속재산가액 | `perHeir[id].grossInheritance` | (a) 직접 | |
| 계. 추정상속재산 산입액 | `perHeir[id].presumedAmount` (L23) | (a) 직접 | |
| 계. 비과세 3종 | `perHeir[id].excludedFromTaxation` (L65, 비과세+불산입 합산) | (c) 세부 미보유 | **세부 3종 분리 불가 → 공란** (D-4 정책) |
| 계. 과세가액불산입 3종 | 동상 | (c) 세부 미보유 | **공란** |
| 계. 가산증여 A21~A24 | **`priorGifts[]` 단일 소스** (doneeId=heirId 필터 → isHeir·specialTreatment 그룹) | (b) 도출 | **나 사전증여 행과 동일 소스** → 나↔계 자기일관. `perHeir[id].priorGiftAmount`(L22)는 AN-1 교차검증용(엔진 §13 합산 cutoff 차이 시 발산 = 예상값, 버그 아님) |
| 계. 합계 | `perHeir[id].taxableValueShare` (L29) | (a) 직접 | |

### 2-2. 데이터 어댑터 설계

**파일**: `lib/calc/besshi-buppyo-2-data.ts` (신규). 자체 산식 0, 집계·도출만.

```ts
interface Buppyo2SectionA {
  relation: string;              // HEIR_RELATION_TO_DECLARANT_LABEL
  name: string;
  residentId?: string;           // 미수집 → 공란
  address?: string;              // EstateLocationFields 없음 → 공란
  legalShareLabel: string | null;    // "1/3" 형태 (legatee·corporate=null)
  legalShareAmount: number | null;
  actualShareRatio: number;
  actualShareAmount: number;     // grossInheritance
}
interface Buppyo2ItemRow {
  kindCode: "A11" | "A12" | "A21" | "A22" | "A23" | "A24"; // 본래상속 A11/A12 · 사전증여 A21~A24
  typeCode: string;              // 01~14 (toEstateItemTypeCode)
  locationOrName: string;        // name.trim() || CATEGORY_LABEL (내부 id 금지)
  isOverseasAsset: boolean;      // 미수집 → false
  overseasCountry?: string;
  ownershipShareLabel?: string;  // 부동산: allocation.amount/itemValue 지분 (작성방법 #6)
  quantityOrArea: number | null; // areaSqm || allocation.areaM2 || quantityCount
  unitPrice: number | null;      // 미수집(대부분) → null. 상장주식 listedStockAvgPrice 있으면 표시
  valuatedAmount: number;        // 본래상속=allocation.amount / 사전증여=PriorGift.giftAmount (실측 확정)
  valuationMethodCode: string;   // 01~08 (toEstateItemValuationMethodCode)
}
interface Buppyo2SectionTotal {
  grossEstateValue: number; presumedAmount: number;
  nonTaxableTotal: number | null;   // 세부 미분리 → null(공란)
  exclusionTotal: number | null;    // 세부 미분리 → null(공란)
  priorGift13: number; priorGift30_5: number; priorGift30_6: number; // 계 가산증여 3행 직접 제공(UI 무산술). §13=Σ(A21+A22)·§30의5=Σ창업(A23)·§30의6=Σ가업(A24). priorGifts[] 단일 소스(나 행 코드와 동일)
  total: number;                    // taxableValueShare
}
interface Buppyo2HeirData { heirId: string; sectionA: Buppyo2SectionA; itemRows: Buppyo2ItemRow[]; sectionTotal: Buppyo2SectionTotal; }

export function buildBuppyo2Data(
  result: InheritanceTaxResult, heirs: Heir[], estateItems: EstateItem[], priorGifts: PriorGift[],
): Buppyo2HeirData[];   // N장 = perHeir keys 순서(sortHeirs)
```

`lib/calc/`에서 `heir-allocation-summary.ts`·`inheritance-legal-share.ts`(`computeLegalShares`) import 허용. `lib/tax-engine/` 내부 중간 함수 직접 import 금지.

### 2-3. 코드 매핑 + 공유 헬퍼 추출 (단일 출처 강제)

**C-1 정정**: 재산종류코드·평가기준코드 라벨은 **KoreanLaw 검증 표(§1-2)를 단일 출처**로 사용. UI 초안에서 재작성한 라벨(`05 보충적평가(토지)` 등)은 **폐기** — 공식 코드(`07 저당권특례§66`/`08 기준시가§61~65`)와 불일치.

`inheritance-filing-form-helpers.ts`에 추가(현 102줄 → ~170줄, 800줄 안전):
```ts
export const ESTATE_ITEM_TYPE_CODE: Record<AssetCategory, string>;   // 01~14 (부표1 GiftTax 매핑 준용)
export function toEstateItemTypeCode(category: AssetCategory): string;
export function toEstateItemValuationMethodCode(item: EstateItem, vr: PropertyValuationResult | undefined): string; // 01~08 — 증여 부표1 toValuationMethodCode 재사용(vr.method + cash→06). 구현 정정: (item) → (item, vr) (회귀 0·정확도↑)
export function inferEstateItemKindCode(heir: Heir): "A11" | "A12";  // legatee/corporate→A12, else A11
```
`GiftTaxValuationFormTable.tsx` private `toPropertyTypeCode`/`toValuationMethodCode` → 공유 함수로 교체·private 제거 (import 사이트 = 자기 자신뿐, 무영향).

**AssetCategory → 재산종류코드** (실측 매핑): cash=01 / real_estate_land=02 / real_estate_apartment=05 / real_estate_building=07 / listed_stock=09 / unlisted_stock=10 / financial·deposit=11 / other=12. 현행 enum에 없는 03·04·06·08·13·14 자산은 **12 기타재산** fallback (D-4 공란 정책 연장).

### 2-4. 나 섹션 행 소스 & 협의분할 미입력 정책

**나 섹션 = 2원 소스** (증여 부표1 `GiftTaxValuationFormTable` L292 `valuationResults.map` + L333 `priorGifts.map` 동일 패턴으로 검증 — 본래상속 행 + 사전증여 행):

1. **본래 상속재산 행** (재산구분코드 A11/A12): `estateItems` 순회 → `heirAllocations`에서 현재 heirId 매칭분만 1행. `allocation.amount`=평가가액, `allocation.areaM2`=면적. `inferEstateItemKindCode(heir)`로 A11(상속인)/A12(수유자·법인).
2. **사전증여 가산 행** (재산구분코드 A21~A24): `priorGifts` 순회 → `doneeId === heirId` 매칭분만 1행. `inferPropertyKindCode(gift, specialTreatment)`로 A21(상속인)/A22(상속인 외)/A23(창업§30의5)/A24(가업§30의6). `toPriorGiftPropertyTypeCode`로 재산종류코드. 평가가액=증여재산가액.

나 행 순서: 본래상속 행 먼저, 사전증여 행 후행 (증여 부표1 순서 동일). 계 섹션의 "상속재산가액"=본래상속 합·"가산하는 증여재산가액"=사전증여 합으로 분리 집계되므로 나 itemized ↔ 계 aggregated 이중표시는 양식 정상 구조(중복 아님).

- **협의분할 미입력**(본래상속 자산 `heirAllocations` 없음): 자동 안분 **금지**(`feedback_no_silent_apportion_fallback`). 해당 자산 행 **생략(공란)**. (사전증여는 doneeId가 명시 입력이므로 안분 이슈 없음)
- 단, 엔진 `계` 합계(`grossInheritance` 등)는 엔진 내부 법정상속분 fallback(`usedLegalShareFallback`)이 이미 반영된 정당한 과세값 → 그대로 표시.
- **나(개별 행 공란) ↔ 계(엔진 합계) 불일치**는 D-4("채우고 공란") 정책의 직접 귀결. UI에서 안내 배지로 명시(§3): "협의분할 미입력 자산은 명세 행에서 생략되며, 계 합계에는 법정상속분 기준으로 포함됩니다."

### 2-5. (통합 케이스 인벤토리 → §4)

### 2-6. 확인 필요 → 결정 적용

| R | 항목 | 결정 (Do 적용) |
|---|---|---|
| R-1 | 법정상속재산가액 도출식 정합 | 작성방법 #3 분배 base = (총상속재산+가산증여) − (수유자유증+비과세+공과금+채무). 엔진 `taxableEstateValue`(=과세가액)와의 **차이 = (과세가액불산입 − 수유자유증)** → 수유자·공익출연 **없는 단순 케이스에선 정확 일치**, 복합 케이스에서만 발산. 1차 구현 = base×법정지분율, **AN-1 손계산 대조로 정확/근사 분기 확정**(§5). 발산 시 컴포넌트 분해값(`legateeNonHeirDeducted`·`debtDeducted`, Phase D 발동 시) 사용. 추정 단정 금지 |
| R-2 | 비과세·과세불산입 세부 3종 | 엔진 미분리 → **공란**(D-4). 단일 합계도 비표시(혼동 방지), 세부 행만 공란 렌더 |
| R-3 | 수유자 법정상속지분율 | 법정상속분 없음 → **공란** (작성방법 무규정, 실무 정합) |
| R-4 | 영리법인 장 포함 | perHeir key에 존재하면 **N장에 포함**. corporate 장 = 계 가산증여(priorGift)만, 본래상속 행 없음 |
| R-5 | 사업자등록번호(지분)란 | 사업자번호 자체 공란. **부동산 지분**(`allocation.amount/itemValue`)은 작성방법 #6대로 도출 표시 |

---

## 3. UI·PDF (A4 가로 + 가로 스크롤)

> 작성: `inheritance-gift-tax-ui-senior` (실측). 엔진 어댑터 `Buppyo2HeirData[]` 소비 전제.

### 3-1. 화면 컴포넌트 트리

**디렉터리**: `components/calc/inheritance/besshi-buppyo-2/`

| 파일 | 역할 | 예상 줄수 | 주요 testid |
|---|---|---|---|
| `BesshiBuppyo2Section.tsx` | 오케스트레이터. props `{result, heirs, estateItems, priorGifts, deathDate}` → `buildBuppyo2Data` 호출 → heirs map → N개 시트. open 토글 + dynamic ssr:false PDF 버튼 | ~120 | `buppyo2-root` `buppyo2-toggle` `buppyo2-sheet-{idx}` |
| `Buppyo2HeirSheet.tsx` | 단일 상속인 1장 (가·나·계 3블록 + 상속인번호 헤더) | ~140 | `buppyo2-heir-{idx}-{ga\|na\|kye}` |
| `Buppyo2GaSection.tsx` | 가. 상속현황 (1행·8칼럼) | ~80 | `buppyo2-ga-{relation\|name\|rrn\|address\|legal-ratio\|legal-value\|actual-ratio\|actual-value}` |
| `Buppyo2NaTable.tsx` | 나. 재산명세 (데이터행 + 빈행 padding 최소 8행). `HorizontalScrollContainer` 내부 | ~180 | `buppyo2-na-table` `buppyo2-na-row-{i}-{code1\|...\|amount}` |
| `Buppyo2KyeSection.tsx` | 계 (12행) | ~150 | `buppyo2-kye-row-{key}` |
| `besshi-buppyo-2-constants.ts` | 라벨·코드표·제목·footer (화면·PDF 공유) | ~140 | — |
| `Buppyo2PdfDownloadButton.tsx` | dynamic ssr:false | ~30 | `buppyo2-pdf-btn` |
| `index.ts` | barrel | ~10 | — |

자산명 공란 시 `name.trim() || CATEGORY_LABEL[category] || "재산"` (내부 id 금지, `feedback_no_internal_id_in_result`). 단일 파일 최대 ~180줄(800줄 정책 충족).

### 3-2. A4 가로 레이아웃 & 가로 스크롤 적용

- 가 섹션(8칼럼)·계 섹션(2칼럼)은 일반 div. **나 섹션(10칼럼)만** `<HorizontalScrollContainer hint="← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기">`로 감쌈.
- 나 표 `<colgroup>` mm 고정폭(총 ~277mm — GiftTaxValuationFormTable 패턴):

| col | 내용 | 폭 |
|---|---|---|
| 1 재산구분코드 | A11/A12… | 22mm |
| 2 재산종류코드 | 코드+라벨 | 28mm |
| 3 국외자산여부 | `[ ]여[ ]부` | 18mm |
| 4 국외재산 국가명 | | 22mm |
| 5 ⑪소재지·법인명등 | 최장 텍스트 | flex |
| 6 사업자번호(지분) | | 34mm |
| 7 수량(면적) | | 22mm |
| 8 단가 | | 26mm |
| 9 평가가액 | 금액 | 30mm |
| 10 평가기준코드 | | 20mm |

- 금액 칸(col 9·계 금액): `BesshiColumn` 또는 `text-right font-mono tabular-nums whitespace-nowrap` (amount-column-align 스킬). 표 컨테이너 `style={{ width: "277mm" }}`.
- **빈 행 정책**(besshi-form-replica 표준): 나 데이터행(본래상속+사전증여)이 8행 미만이면 공식 양식 행수만큼 빈 `<tr>` padding(최소 8행 — 원본 양식 데이터행 수). 8행 초과 시 행 추가 허용(절단 금지, 출력 전용). 빈 행 셀은 `&nbsp;`.

### 3-3. PDF landscape 문서

**파일**: `lib/pdf/InheritanceBuppyo2PdfDocument.tsx`
- 상속인별 `<Page size="A4" orientation="landscape" style={s.page}>` (1상속인=1+페이지). 행 초과 시 react-pdf 자동 wrap 허용(출력 전용).
- `besshi-pdf-styles.ts` `fontFamily` 배열 재사용(글리프 fallback). landscape padding ~15.
- `Buppyo2PdfDownloadButton.tsx` = `dynamic(()=>…,{ssr:false})` + `PDFDownloadLink`. 파일명 `상속인별상속재산_부표2_${deathDate || "미상"}.pdf` (deathDate 공백 fallback).

### 3-4. 상수 파일

`besshi-buppyo-2-constants.ts`: 폼 제목/부제(`[별지 제9호서식 부표 2] (개정 2024.3.22.)`)·footer(`210mm×297mm`), 가/나/계 칸 라벨, **재산구분코드 12종·재산종류코드 14종·평가기준코드 8종 표(§1-2 KoreanLaw 검증 본문 그대로)** — 작성방법 펼침 토글용. 관계 라벨은 `HEIR_RELATION_TO_DECLARANT_LABEL` 재사용.

### 3-5. 마운트 지점 & 렌더 가드

`InheritanceTaxResultView.tsx` L335 `FilingForm9CoverSection` 직후:
```tsx
{result.heirAllocationResult && heirs && heirs.length > 0 && (estateItems || priorGifts) && (
  <BesshiBuppyo2Section
    result={result} heirs={heirs}
    estateItems={estateItems} priorGifts={priorGifts}
    deathDate={deathDate}
  />
)}
```
Props 변경 없음 — `heirs`(L132)·`estateItems`(L136)·**`priorGifts`(L138)**·`deathDate` 모두 InheritanceTaxResultView에 기존 존재(실측). `priorGifts`는 이미 `GiftTaxValuationFormTable`에 전달 중(L279). import 1줄 추가. 가드에 `priorGifts` OR 추가 — 본래상속 없고 사전증여만 있는 케이스도 렌더(나 사전증여 행). 인쇄: 토글 `print:hidden`, 본문 `hidden print:block`, 스크롤 `print:overflow-visible`(내장).

### 3-6. 14개 동기화 지점

**엔진 변경 0·신규 입력 0 → ⑤·⑦만 해당, 나머지 12개 N/A.**

| 지점 | 해당 | 비고 |
|---|---|---|
| ⑤ UI 위젯 | **해당** | 신규 출력 컴포넌트 7개 |
| ⑦ 결과 카드 | **해당** | `BesshiBuppyo2Section` 결과뷰 마운트 |
| ①②③④⑥⑧⑨⑩⑪⑫⑬⑭ | N/A | FormData·API·Zod·validate·사이드바 무변경 |

---

## 4. 통합 케이스 인벤토리 (Do/Design 진입 게이트 — 행 ≥ 1 충족)

| # | 상속인 구성 | 협의분할 | N장 | 각 장 나 행 | 계 합계 기준 | 검증 포인트 |
|---|---|---|---|---|---|---|
| C-1 | 배우자 단독 | 전체 입력 | 1 | estateItems 전체 | grossInheritance 전액 | 단일 시트·법정지분율 1/1 |
| C-2 | 배우자+자녀2 | **미입력** | 3 | 공란(안내 배지) | 법정상속분 fallback(엔진값) | 나↔계 불일치 안내(§2-4) |
| C-3 | 배우자+자녀1+수유자 | 일부 입력 | 3 | 입력분만 | 수유자=입력분만 | 수유자 법정지분율 공란(R-3) |
| C-4 | 자녀3+영리법인(사전증여 受) | 전체 입력 | 4 | 법인 장: 본래상속 0행, 나 사전증여 행 A22(상속인 외) | 법인 계=가산증여(A22)만 | R-4 법인 장 포함·나 A22 행 |
| C-5 | 배우자+자녀2, 사전증여 有 | 전체 입력 | 3 | 본래상속 행 + **나 사전증여 행 A21** + 계 가산증여 A21 | taxableValueShare | 나↔계 동일소스 자기일관(P2-1) |

---

## 5. Pre-Do Anchor 계획 (`pre-do-anchor-verification`)

Do 진입 전 anchor 우선 실행 → 디자인 환류 기회 확보. "현행 일치 예상" 가정 금지.

1. **AN-1 (엔진 도출 정합)** [≡ 디자인 케이스표 AN-R1]: `buildBuppyo2Data` — C-1(배우자 단독) 입력 → `sectionA.actualShareAmount === perHeir.grossInheritance`, `sectionTotal.total === taxableValueShare` 자기일관 검증. **R-1 법정상속재산가액 산식**을 손계산값과 대조(실패 시 §2-6 R-1 근사 정책 환류).
2. **AN-2 (나 행 렌더)** [≡ 디자인 케이스표 C-3]: C-3 협의분할 일부 입력 → 매칭 heirId 행만 생성, 미매칭 자산 행 생략 확인. 사전증여 행은 doneeId 매칭으로 별도 생성.
3. **AN-3 (코드 매핑 단일 출처)** [≡ 디자인 케이스표 AN-R2]: `toEstateItemValuationMethodCode` 출력이 §1-2 공식 8종 코드(`07 저당권특례`·`08 기준시가`)와 일치(C-1 정정 회귀 방지).

---

## 6. 작업 순서 (Plan 병렬 / **Do 시퀀셜**)

1. **엔진 시니어 선행**: ① 공유 헬퍼 추출(`inheritance-filing-form-helpers.ts` + `GiftTaxValuationFormTable` 교체) → ② `lib/calc/besshi-buppyo-2-data.ts` 어댑터 + 타입 → ③ AN-1~AN-3 anchor 작성·실행 → R-1 정합 확정.
2. **UI 시니어 후행**: 엔진이 확정한 `Buppyo2HeirData[]`를 받아 ④ 컴포넌트 7개 + ⑤ 상수 + ⑥ PDF + ⑦ 마운트. ④/⑬ 충돌 회피(타입 선확정 후 UI).
3. **Check**: `ui-engine-sync-checker`(⑤⑦) → `bkit:gap-detector`(matchRate) → 브라우저 E2E(`e2e/inheritance-besshi-buppyo-2.spec.ts` — N장 렌더·가로 스크롤 thumb·PDF 버튼).
4. **회귀**: `npx tsc --noEmit` 0 + `npm test`(공유 모듈 영향 — GiftTaxValuationFormTable 교체로 증여 부표1 회귀 필수).

---

## 7. 리스크·정책

| 리스크 | 대응 |
|---|---|
| 공유 헬퍼 추출로 **증여 부표1 회귀** | `GiftTaxValuationFormTable` 기존 anchor 전수 통과 확인(교체 전후 출력 동일). `npm test` 전체 |
| 코드 라벨 재작성으로 공식 불일치(C-1) | KoreanLaw 검증 표 단일 출처 강제. AN-3 anchor |
| 협의분할 미입력 나↔계 불일치 오해 | 안내 배지 명시(§2-4·§3) |
| R-1 법정상속재산가액 산식 부정확 | AN-1 손계산 대조 후 단정. 미확정 시 근사+주석 |
| 800줄 초과 | 7파일 분산(최대 ~180줄) |

---

## 부록: 미해결(향후 확장)
- EstateItem 위치 필드(`EstateLocationFields`)에 주소가 있으면 ⑪소재지 자동 채움 가능 — 현재 대부분 미입력. 후속 입력 폼 확장 시 연동.
- 비과세·과세가액불산입 세부 3종 분리: 엔진 perHeir에 세부 echo 필드 추가하면 공란 해소 가능(별도 PR, `echo-field-pattern`).
- 주민등록번호·사업자등록번호 입력 경로: 신고서 완전 작성 목적이면 EstateItem/Heir 필드 확장 필요(D-4 범위 외).
