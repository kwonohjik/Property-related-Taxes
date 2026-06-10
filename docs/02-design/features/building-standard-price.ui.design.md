# 건물 기준시가 계산기 — UI 디자인

**작성일**: 2026-06-10
**계획서**: `docs/00-pm/building-standard-price.plan.md`
**엔진설계**: `building-standard-price.engine.design.md`
**PDCA 단계**: Design (STEP 12 UI 설계)

---

## 0. 아키텍처 결정 (표준 14지점과의 차이)

| 결정 | 내용 | 근거 |
|---|---|---|
| **API route 없음** | 클라이언트에서 `calcBuildingStandardPrice()` **직접 import 호출** | 데이터가 정적 상수(DB 세율 불요)·엔진 순수 함수·이력 저장 불요(보조 계산기) |
| **폼 상태** | 공용 컴포넌트 `BuildingStdPriceForm` + 로컬 `useState`(마법사 store 비종속) | 독립 도구. 새로고침 보존 불필요(원하면 sessionStorage 옵션) |
| **재사용** | 독립 페이지 + 마법사 모달이 **동일 폼 컴포넌트** 사용, `onResult(result)` 콜백 차이만 | DRY. 마법사는 결과를 해당 세목 단일 필드에 주입 |
| **14지점 적용** | ⑤UI위젯·⑦결과카드·⑧validation **자체 적용**. ①②③⑥(마법사 store)·④⑨~⑭(API/Route)는 **마법사 통합(Phase G) 시 해당 세목 단일 필드만** | 독립 도구는 store/route 미경유 |

---

## 1. 사용자 시나리오

### 1.1 양도 모드 (이미지 19)

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | `/tools/building-standard-price` 진입 → 세목 토글 **"양도"** | RadioCardGroup. 취득년도·양도년도 필드 노출 |
| 2 | 기계식주차전용빌딩 토글(필요 시 ON) | ToggleCard. ON 시 구조=기계식주차전용빌딩 그룹·조정율 IV 배제 안내 |
| 3 | 신축년도 2005, 건물면적 200㎡, 취득년도 2010, 양도년도 2024 입력 | DateInput 아님(연도 Select). 면적 DecimalInput |
| 4 | 취득당시 건물구조/용도 선택(2010년 옵션셋), 양도당시 구조/용도(2024년 옵션셋) | 연도별 드롭다운 ×4 (B안) |
| 5 | 취득당시·양도당시 ㎡당 개별공시지가 입력 | LandPriceLookupField ×2 |
| 6 | "기준시가 계산하기" | 클라이언트 엔진 직접 호출. **취득기준시가·양도기준시가 2카드** + 각 산식 |

### 1.2 상속·증여 모드 (이미지 18)

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | 세목 토글 **"상속·증여"** | 상속·증여년도·리모델링년도 필드 노출 |
| 2 | 신축년도·건물면적·상속증여년도·(선택)리모델링년도 | 리모델링년도 입력 시 잔가율 신축연도 override |
| 3 | 건물구조/용도 선택(상증년도 옵션셋), ㎡당 공시지가 | 드롭다운 + LandPriceLookupField ×1 |
| 4 | **조정률 "[특성으로 계산]"** → 특성 입력 모달(7구분) | 모달서 지붕재료·최고층수·연면적·주택유형·상가층·개축·무벽·구조진단 선택 → 조정율 자동 산출. 또는 직접 %입력 |
| 5 | "기준시가 계산하기" | **1카드** + 산식(조정율 포함) |

---

## 2. 케이스 인벤토리 (UI 분기)

| # | 케이스 | 세목토글 | 분기 | 본 작업 |
|---|---|---|---|---|
| U-01 ★ | 상증 기본 | 상속·증여 | 1시점·조정율 모달 | ★ Phase F |
| U-02 ★ | 양도 2시점(2001 이후) | 양도 | 2시점 카드 | ★ Phase F |
| U-03 | 양도 취득 2000이전(산정기준율) | 양도 | acqYear≤2000 분기 안내 | Phase F |
| U-04 | 상증 조정율 다구분 모달 | 상속·증여 | 모달 7구분 곱 | Phase F |
| U-05 | 양도 동일연도 환산(제1·제2산식 선택) | 양도 | 보유월수·조정월수·산식 라디오·전기공시지가/신규기준시가 노출 | Phase F |
| U-06 | 마법사 통합(양도 환산취득가) | — | 모달 버튼→필드 주입 | Phase G |
| U-07 | 마법사 통합(상증 부동산 평가) | — | 모달 버튼→필드 주입 | Phase G |
| U-08 | 기계식주차 토글 ON(연도별 단가 안내·주차대수 검증) | 공통 | 일반 입력 숨김·parkingLotCount 필수 | Phase F (재검토 신규) |

> U-01·U-02가 Do primary. U-06·U-07은 Phase G.

---

## 3. 파일 구조

```
app/tools/building-standard-price/page.tsx          # 독립 페이지 (세목 토글 + 폼 + 결과)
components/calc/building-std-price/
  ├─ BuildingStdPriceForm.tsx        # 공용 입력 폼 (독립·모달 공용). props: { mode?, onResult }
  ├─ BuildingStructureSelect.tsx     # 연도별 구조 드롭다운 (listStructureOptions)
  ├─ BuildingUsageSelect.tsx         # 연도별 용도 드롭다운 (listUsageOptions)
  ├─ AdjustmentRateModal.tsx         # 조정율 특성 입력 모달 (7구분, 상증만)
  ├─ BuildingStdPriceResultCard.tsx  # 결과 카드 (시점별 breakdown, formula-display-builder)
  └─ BuildingStdPriceModalButton.tsx # 마법사 통합용 "건물 기준시가 계산" 버튼+Dialog (Phase G)
lib/calc/building-std-price-form.ts  # FormState 타입·initial·normalize·toEngineInput·validate (자체)
```

---

## 4. 폼 상태 (⑤ 자체 / 마법사 store 비종속)

```ts
// lib/calc/building-std-price-form.ts
export interface BuildingStdPriceFormState {
  taxType: "transfer" | "inheritance_gift";
  floorArea: string;
  builtYear: string;
  remodelYear: string;           // 상증
  isMechanicalParking: boolean;
  parkingLotCount: string;       // 기계식주차 주차대수(재검토 추가 — 위젯 트리와 dual-truth 해소)
  // 양도
  acquisitionYear: string;
  transferYear: string;
  acqStructureKey: string; acqUsageKey: string; acqLandPrice: string;
  transStructureKey: string; transUsageKey: string; transLandPrice: string;
  holdingMonths: string;         // 동일연도 환산 — 필수(일자 미수집)
  adjustMonths: string;          // 동일연도 조정월수(기본 "12")
  sameYearFormula: "prev" | "new"; // §164⑧ 제1/제2산식 선택(기본 "prev")
  newNoticePrice: string;        // 제2산식: 새로운 기준시가 ㎡당 금액
  prevLandPrice: string;         // 제1산식: 취득전기(취득연도-1) ㎡당 공시지가
  // 상증
  valuationYear: string;
  valStructureKey: string; valUsageKey: string; valLandPrice: string;
  adjustmentMode: "features" | "manual";
  adjustmentFeatures: SpecialAdjustmentFeatures | null;
  manualAdjustmentRate: string;
}
export const initialBuildingStdPriceForm: BuildingStdPriceFormState = { /* 빈 문자열·false·"transfer" */ };
// parseAmount: components/calc/inputs/CurrencyInput.tsx:22 / parseDecimal: DecimalInput.tsx:88 (실측)
export function toEngineInput(f: BuildingStdPriceFormState): BuildingStandardPriceInput { /* parseDecimal·parseInt */ }
export function validateBuildingStdPriceForm(f: BuildingStdPriceFormState): string | null { /* §8 */ }
```

> normalize(③)·initial(②): 자체 파일에서 관리. select-on-focus는 글로벌 `SelectOnFocusProvider` 또는 공용 입력 컴포넌트 내장으로 자동.

---

## 5. 입력 위젯 트리 (⑤) — UI 순서 = 엔진 계산 순서

```
BuildingStdPriceForm
├── RadioCardGroup (세목: 양도 / 상속·증여)         ← 최상단, 이하 필드 분기
├── ToggleCard (기계식주차전용빌딩, tone=slate)     ← OFF도 배경 유지. ON 시 특수산식 모드
│   └ ON(특수산식 — engine §A'): 구조/용도/위치/연면적 입력 **숨김**. 대신 노출:
│       ├ Select (신축년도) [공통 ①에서 이미]  + (양도) 취득·양도년도 / (상증) 상증·리모델링년도
│       ├ 정수 입력 (주차대수, parkingLotCount)  hint:"기계식 주차대수 — 기준시가 = 연도별 단가 × 경과연수별 잔가율 × 주차대수"
│       └ 안내(violet): "기계식주차전용빌딩은 해당 연도 고시 단가 × 경과연수별 잔가율(고시 내용연수) × 주차대수로
│           산정됩니다(조정률 미적용). 단가·내용연수는 연도별로 다릅니다(예: 2025년 6,000,000원·30년 / 2001년 5,000,000원·20년)"
│
├── [공통] ① 건물 기본 (sky 카드)
│   ├ Select (신축년도)
│   ├ DecimalInput (건물면적 ㎡)  hint:"연면적(공동주택=전유+공용)"
│   └ [상증만] Select (리모델링·대수선년도, "해당없음" 포함)  hint:"입력 시 잔가율을 리모델링년도 기준으로 적용"
│
├── [양도 분기]
│   ├ ② 취득 시점 (amber 카드)
│   │   ├ Select (취득년도)  → 선택 시 ③④ 구조·용도 옵션셋 갱신
│   │   ├ BuildingStructureSelect (취득당시 구조, year=취득년도)
│   │   ├ BuildingUsageSelect (취득당시 용도, year=취득년도)
│   │   └ LandPriceLookupField (취득당시 ㎡당 공시지가)  hint:§1.5 기준일
│   │   └ [취득년도≤2000 시] 안내(violet): "2001.1.1 ㎡당금액 × 산정기준율로 환산됩니다.
│   │       구조·용도는 **2001년 지수표** 기준으로 적용됩니다(D2)" — 구조/용도 드롭다운 옵션셋 = 2001년
│   ├ ③ 양도 시점 (emerald 카드)
│   │   ├ Select (양도년도)
│   │   ├ BuildingStructureSelect (양도당시 구조, year=양도년도)
│   │   ├ BuildingUsageSelect (양도당시 용도, year=양도년도)
│   │   └ LandPriceLookupField (양도당시 ㎡당 공시지가)
│   └ [취득년도===양도년도 시] ④ 동일연도 환산 (rose 안내 + 입력) — §164⑧ 제1·제2산식(재검토 보강)
│       ├ RadioCardGroup (산식: 취득전기 기준시가 기준 / 새로운 기준시가 기준)  hint:"예정신고기한까지 새 기준시가가
│       │   고시된 경우 새로운 기준시가 기준 환산을 선택할 수 있습니다" (중립 표기)
│       ├ [제1산식] LandPriceLookupField (취득전기(취득년도-1) ㎡당 공시지가, prevLandPrice)
│       ├ [제2산식] CurrencyInput (새로운 기준시가 ㎡당 금액, newNoticePrice)
│       ├ 정수 입력 (보유월수, 필수)  hint:"§164⑧ 동일연도 양도는 보유월수로 환산(초일 산입, 1월 미만=1월)"
│       └ 정수 입력 (기준시가 조정월수, 기본 12)  hint:"전기 기준시가 결정일~취득 당시 기준시가 결정일 전일의 월수(연 1회 고시 시 12)"
│
├── [상속·증여 분기]
│   ├ ② 평가 시점 (emerald 카드)
│   │   ├ Select (상속·증여년도)
│   │   ├ BuildingStructureSelect (구조, year=상증년도)
│   │   ├ BuildingUsageSelect (용도, year=상증년도)
│   │   └ LandPriceLookupField (㎡당 공시지가)  hint:"2001~2002는 해당연도 1.1 기준(§1.5②)"
│   └ ③ 조정률 (violet 카드)
│       ├ RadioCardGroup (특성으로 계산 / 직접 입력)
│       ├ [특성] 버튼 "[건물 특성으로 조정률 계산]" → AdjustmentRateModal
│       │        + 산출된 조정율 배지 표시(예: "조정률 132%")
│       └ [직접] DecimalInput (조정률 %, 기본 100)
│
└── Button "기준시가 계산하기" (validate 통과 시 엔진 호출 → onResult)
```

> 연도 Select 변경 → 해당 시점 구조/용도 옵션셋 변경 → **기존 선택이 새 옵션셋에 없으면 무효화**(R1 가드, useMemo 파생 + onChange 리셋, useEffect 금지).
> 연도 입력은 `DateInput`(type=date) 아님 — **연도 Select**(엔진이 연도 정수만 사용).
> **연도 Select 옵션 = 데이터 보유 연도 범위**(재검토 보강): 시점별 필요 테이블의 보유 연도 교집합만 노출(예: 위치지수 2026년표 부재 시 평가·양도년도 2026 선택 불가 + 안내. 자료 보강 시 자동 확장 — R11).
> 구조 드롭다운 옵션은 **개별 구조명 단위**(지수표 1행=다수 구조 묶음 — 같은 행 안에서 잔가율 그룹이 갈리므로 행 단위 선택 금지).
> 공시지가 hint에 **다필지 가중평균** 안내(p.300 §6⑥): "부속토지가 여러 필지면 면적 기준 가중평균한 ㎡당 가액 입력".

---

## 6. 조정율 특성 입력 모달 `AdjustmentRateModal` (상증 전용)

shadcn Dialog. 7구분을 섹션으로. 실시간 조정율 미리보기.

```
Dialog "개별건물 특성 조정률"
├ I  지붕재료 (구조지수<100일 때만 활성)  RadioCardGroup [해당없음/슬레이트등100/패널등80/함석등60]
├ II 규모 (가장 높은 1개 자동)
│   ├ 최고층수 **정수 입력**(실제 최고층수, 지하·옥탑 제외 → 엔진 구간 판정)  (주거용은 아파트만)  ← D3
│   ├ 연면적: **별도 입력 없음** — 폼의 건물면적(floorArea) 재사용(주거용 미적용, 적용요령4)  ← D4
│   └ 지능형건축물 RadioCardGroup [없음/3~4등급110/1~2등급120]
├ III 주택유형 (단독/공동 중 1개)  Select [해당없음/단독264~331:120/단독331↑:140/공동149~215:120/공동215↑:140]  ← D3 단일
├ IV 상가·부속 (가장 낮은 1개, **isMechanicalParking ON 시 비활성** — 주차전용빌딩 배제)  Select [상가1층120/2층105/지하1층80/지하2층↓70/주차·부속60]
├ V  개축 RadioCardGroup [없음/1회110/2회↑120]  (전부개축은 신축년도 재설정 안내)
├ VI 무벽건물: 무벽면적비율 입력(실제 비율 → 엔진 구간 판정: 1/4~2/4:80, 2/4~3/4:70, 3/4↑:60)  (납세자 입증)  ← D3
├ VII 구조진단·철거 Select [없음/B90/C80/D60/E30/철거사용30/철거미사용0/화재멸실(비율)]  (입증)
└ Footer: "예상 조정률: 132%" (실시간) + [적용] [취소(데이터 폐기 확인 Dialog)]
```

> 모달 데이터 폐기는 window.confirm 금지 → shadcn Dialog(`feedback_dialog_data_discard_confirm`). 조정율 = 각 구분 (지수/100) 곱 × 100(%).

---

## 7. 결과 카드 (⑦) `BuildingStdPriceResultCard`

`formula-display-builder` 패턴. 변수배지 + 값 + fine-print.

- **양도**: 카드 2개 — "취득당시 건물 기준시가" / "양도당시 건물 기준시가". 동일연도 환산 시 양도카드에 rose 배지 "§164⑧ 환산 적용".
- **상증**: 카드 1개 — "건물 기준시가".

각 카드 산식(한국어 풀어쓰기, 약어·floor 금지):
```
㎡당 금액 = 신축가격기준액 850,000 × 구조지수 1.00 × 용도지수 1.10 × 위치지수 1.00 × 잔가율 0.910 [× 조정률 1.32]
          = 850,850 → 1,000원 미만 절사 → 850,000
건물 기준시가 = 850,000 × 연면적 200㎡ = 170,000,000
```
- 2000이전 취득카드: "2001.1.1 ㎡당금액 × 연면적 × 산정기준율 1.047" 추가 행.
- 기계식주차 카드(재검토 보강): "기준시가 = 단가 6,000,000 × 잔가율 0.850 × 주차대수 50 = 255,000,000" — ㎡당 금액·지수 행 없음, 내용연수 fine-print(mechDurableYears echo).
- 동일연도 환산 카드: 적용 산식(제1/제2)·보유월수·조정월수 fine-print.
- 위치지수 적용 공시지가 기준연도 fine-print(§1.5 echo).

> "원" 접미사 금지(`feedback_no_won_suffix`). 금액 칸 `amount-column-align`(tabular-nums 우측정렬).

---

## 8. Validation (⑧) `validateBuildingStdPriceForm`

엔진 silent-fallback 식별표와 **동기화**(API 변환 fallback ↔ validate 동일).

```
기계식주차 ON(재검토 추가 — 일반 규칙 적용 시 모순):
      parkingLotCount>0 필수 / floorArea·structureKey·usageKey·landPrice 검증 면제(미사용)
      해당 연도가 mech-parking-formula 보유 범위 밖 → 차단
일반(기계식주차 OFF):
      floorArea>0 / builtYear 유효 / 각 시점 structureKey·usageKey 선택 / landPrice>0
양도: acquisitionYear·transferYear 유효(acquisitionYear < builtYear 허용 — p.301 §8④ 완공 전 취득).
      동일연도면 holdingMonths>0 필수(일자 미수집 — 도출 불가) + 제1산식 prevLandPrice>0 / 제2산식 newNoticePrice>0
상증: valuationYear 유효. adjustmentMode="manual"이면 manualRate 숫자(빈값=100 허용),
      "features"면 features 객체(미선택=조정율 1.0 허용 — 가산요인 없음 정상)
공통: 입력 연도가 데이터 보유 범위 밖 → 차단(위치지수 2026 부재 — R11. 연도 Select 옵션 제한과 이중 가드)
미선택 구조/용도/공시지가 → 명확한 오류 메시지 차단(자동 채움 금지)
```

> 차단 validation 추가 시 해당 경로 E2E 회귀(`feedback_blocking_validation_full_e2e_regression`) — 단 독립 도구라 타 세목 영향 없음.

---

## 9. 마법사 통합 (Phase G) — U-06·U-07

`BuildingStdPriceModalButton`: 해당 입력 필드 옆 "건물 기준시가 계산" 버튼 → Dialog(BuildingStdPriceForm) → `onResult(result)` → 결과 숫자를 **해당 세목 단일 필드**에 주입.

| 세목 | 주입 대상 필드 | 위치 |
|---|---|---|
| 양도(일반건물) | `gbAcqBuildingValue`/`gbTransferBuildingValue` | `GeneralBuildingBlock.tsx` |
| 양도(상업용) | 해당 건물기준시가 필드 | `CommercialBuildingBlock.tsx` |
| 상속·증여 | 부동산 평가 건물 기준시가 | 부동산 평가 폼 |

> 주입 방식이라 마법사 store 신규 enum/객체 추가 없음 → ⑨~⑭(Zod/Route) 대부분 비해당. 주입된 값은 기존 단일 필드의 기존 동기화 경로 사용. `sourceCalculationId` 불요(외부 API 아님). 자동 채움 후 사용자 수정 가능.

---

## 10. 동기화 지점 매핑 (독립 도구 기준)

| # | 지점 | 적용 | 위치 |
|---|------|------|------|
| ① 폼 상태 | 자체 | `lib/calc/building-std-price-form.ts` `FormState` |
| ② initial | 자체 | 동 `initialBuildingStdPriceForm` |
| ③ normalize | 자체(또는 불요·useState) | 동 |
| ④ API 변환 | **API 없음** → `toEngineInput()` 클라 직접 | 동 |
| ⑤ UI 위젯 | ✅ | `BuildingStdPriceForm` + Select/Lookup |
| ⑥ 사이드바 합계 | 해당없음(단일 계산기) | — |
| ⑦ 결과 카드 | ✅ | `BuildingStdPriceResultCard` |
| ⑧ validation | ✅ | `validateBuildingStdPriceForm` |
| ⑨~⑭ Zod/Route | **해당없음**(API route 미사용) | Phase G 마법사 주입 시 기존 세목 단일 필드 경로 |

---

## 11. DoD 체크리스트

- [ ] U-01·U-02 anchor 통과(엔진 BSP-01·BSP-06 연동)
- [ ] 연도 변경 → 구조/용도 옵션셋 갱신·기존선택 무효화 가드(useEffect 금지)
- [ ] 연도 Select 옵션 = 데이터 보유 연도 교집합(위치지수 2026 부재 가드 — R11)
- [ ] 기계식주차 ON: parkingLotCount 필수·일반 필드 검증 면제·연도별 단가 안내(U-08)
- [ ] 동일연도 환산: 산식 라디오 + 보유월수 필수 + 조정월수 기본 12(U-05)
- [ ] 조정율 모달 7구분 → 실시간 % + 적용
- [ ] 양도 2카드 / 상증 1카드 / 기계식주차 카드 산식 한국어 풀어쓰기
- [ ] `npx tsc --noEmit` 0건
- [ ] E2E: `e2e/building-standard-price.spec.ts`(독립 페이지 양도·상증 각 1) — Playwright(`feedback_browser_verify_with_playwright`)
- [ ] 금액 정렬 `amount-column-align` / "원" 접미사 없음 / select-on-focus
