# 함께 양도(서로 다른 물건) — 전 자산이 지분이면 「같은 물건 지분 분할(축 B)」로 읽히는 결함 (Plan v0.1)

> 작성 2026-10-18 · 기준 master `6f5121daa` · 워크트리 `Property-related-Taxes-ffb` (브랜치 `plan/full-fractional-distinct-assets`)
> 선행: #2080(`ddd3f5b16`) — 함께 양도 묶음에 지분 자산이 **섞인** 경우를 고쳤고, **전부** 지분인 경우를 남김으로 기록했다
> (memory `project_companion_partial_share_bundle_defect`).

---

## 0. 요약

「같은 날 다른 부동산도 함께 파셨나요?」(함께 양도)로 서로 다른 물건을 넣고 **모든 자산이 지분**(예: A 토지의 1/2 + B 토지의 1/2)이면,
API 변환·검증·서버가 이 묶음을 「같은 물건을 지분으로 나눠 취득(축 B)」으로 읽는다. 화면은 함께 양도로 받는다.

| 사례 (총 양도가액 10억, 토지 2건 각 50%) | 현행 | 함께 양도로 계산(시제품) |
|---|---|---|
| T1 실거래가 구분 기재 — 12억(2008 취득 2억)·8억(2022 취득 3.5억) 물건의 각 50% | 자산별 양도가액 5억·5억 · 총세액 **229,812,000** | 6억·4억 · **218,724,000** (−11,088,000) |
| T2 기준시가 안분 — 기준시가 5억·3억, 취득 조건은 T1과 같음(2008 2억 · 2022 3.5억) | 5억·5억 · **229,812,000** | 6.25억·3.75억 · **215,952,000** (−13,860,000) |
| P2 실거래가 — 50% · 30% (12억·10억, 총 9억) | ⑧ 「지분 분할 취득: 전체 지분율 합계가 100%가 되어야 합니다 (현재 80.00%)」 — **계산 불가** | 6억·3억으로 계산 |

- 지분율 합이 100%면 **오류 표시 없이 틀린 값**, 100%가 아니면 **함께 양도로 입력했는데 지분 분할 오류로 막힌다**.
- 원인: 지분율이 모두 채워지면 두 경우를 데이터로 구분할 수 없는데(코드 주석 `transfer-tax-api-asset-basics.ts:189-191`), 사용자의 선택(`splitMode`)은 화면 안 상태로만 있고 저장·전달되지 않는다.

**제안**: 사용자의 선택(함께 양도 / 지분별 취득)을 폼에 저장하고 요청 본문에 명시 플래그로 보낸다. 축 B 판정은 이 값을 따르고, 값이 없으면(기존 저장 데이터) 현행 추론을 그대로 쓴다.

결정이 필요한 것: §5 Q-1~Q-3.

> ✅ **2026-10-18 사용자 결정 — Q-1~Q-3 권고안대로**: Q-1 A(폼 저장 + 본문 명시 플래그) · Q-2 A(필드 없으면 현행 추론) · Q-3 토글 전이 그대로 기록. 진행 결과는 §9.

---

## 1. 재현 (throwaway 프로브, 커밋 안 함)

경로: 화면 폼(`createDefaultTransferFormData` + 토지 2건) → ⑧ `collectStepIssues`(0~3단계) → ④ `callTransferTaxAPI`(본문 캡처) → 실제 route `POST`(⑫⑭) → 다건 엔진.
픽스처는 #2080 anchor `__tests__/api/transfer.route.companion-partial-share-bundle.anchor.test.ts`와 같다(양도일 2026-02-16, 각 자산 「나머지 지분은 타인 소유」).

| 사례 | 모드 | 지분 | 물건 전체 입력 | ⑧ | 자산별 양도가액(현행) | 「물건 전체 양도가액」(현행) | 함께 양도로 계산 시 |
|---|---|---|---|---|---|---|---|
| P1 | 실거래가 | 50/50 | 12억·8억 | 통과 | 5억·5억 | 10억·10억 | 6억·4억 / 12억·8억 |
| P2 | 실거래가 | 50/30 | 12억·10억(총 9억) | **차단**(합계 80%) | — | — | 6억·3억 / 12억·10억 |
| P3 | 기준시가 안분 | 50/50 | 기준시가 5억·3억 | 통과 | 5억·5억 | 10억·10억 | 6.25억·3.75억 / 12.5억·7.5억 |
| P4 | 기준시가 안분 | 50/30 | 기준시가 5억·5억 | **차단**(합계 80%) | — | — | 6.25억·3.75억 / 12.5억·12.5억 |
| P5 | 실거래가 | 60/40 | 12억·7억(총 10억) | 통과 | 6억·4억 | 10억·10억 | 7.2억·2.8억 / 12억·7억 |

- P1·P3·P5는 두 토지의 취득 조건이 같아 합산 과세에서 총세액이 같았다(218,031,000). 취득 조건이 다르면 T1·T2처럼 세액이 달라진다.
- 「물건 전체 양도가액」은 엔진이 고가주택 기준금액 안분의 분모로 쓰는 값이다(`transfer-tax-taxable-gain.ts:119-122` `denom`). 주택 사례의 세액 영향은 **측정하지 않았다**(픽스처가 토지).
- 「함께 양도로 계산」 값은 축 B 판정 3곳(④ 술어·⑫·route)을 임시로 끈 시제품 패치로 냈다(원복 확인).

---

## 2. 원인 (`6f5121daa`)

### 2.1 화면은 사용자의 선택을 따른다

- `app/calc/transfer-tax/steps/Step1.tsx:60-83` `splitMode`는 컴포넌트 `useState`다. 토글 A(함께 양도)·토글 B(지분별 취득) 핸들러(`:102-148`)만 바꾼다.
  세션 복원 때만 지분율로 추론한다(`isFractionalSplitRestorable` — 지분 자산이 있고 100% 자산이 없으면 축 B).
- `components/calc/transfer/CompanionSaleModeBlock.tsx:238-243` — 자동가(총양도가 × 지분율)는 `isFractionalSplit`(= `splitMode === "fractional"`, `CompanionAssetCard.tsx:378`)일 때만. 함께 양도면 물건 전체(100%) 입력 칸을 보여 준다.

### 2.2 API 변환·검증·서버는 지분율 데이터로 판정한다

`isFullFractionalBundle(assets)` = 자산 2건 이상 + 전부 지분(`transfer-tax-api-asset-basics.ts:157-164`). 호출 지점:

| 층 | 위치 | 쓰임 |
|---|---|---|
| ④ | `transfer-tax-api.ts:103` | 주 자산 기본정보 병합(`fractionalBundleMerge`) |
| ④ | `transfer-tax-api-companion-payload.ts:132` | 컴패니언 양도가액 = 총양도가 × 지분율 |
| ④ | `transfer-tax-api-gb-shares.ts:188` | 일반건물 지분 경로 |
| ⑧ | `transfer-tax-validate.ts:93` | 「전체 지분율 합계 100%」 등 축 B 규칙 |
| ⑧ | `transfer-tax-validate-asset.ts:137 · 301 · 339 · 349` | 자산별 축 B 규칙 |
| 기타 | `same-day-housing-bundle.ts:23` | 같은 날 주택 묶음 판정 제외 |
| 기타 | `reverse-appurtenant-house.ts:26` | 역방향 부수토지 판정 제외(별도 술어 `isFractionalSplitBundle`) |

서버는 본문 모양으로 다시 판정한다 — 주 자산·전 컴패니언이 `totalPropertyTransferPrice`를 가지면 축 B:
- ⑫ `lib/api/transfer-tax-schema.ts:175-177` (양도가액 모드 검증 면제)
- ⑭ `app/api/calc/transfer/route.ts:219-227` (`isFullFractionalBundle` → 총양도가 × 지분율 주입 · `soleSplitAcquisition: true` `:476-478` · 세대 사실 공유 `:429-443`)

⚠️ 그래서 ④만 고쳐도 안 된다. #2080 규약대로 함께 양도 지분 자산은 `totalPropertyTransferPrice`(물건 전체 가액)를 싣는데, 전 자산이 지분이면 그 모양이 곧 「축 B」로 읽힌다. 서버에 **명시 신호**가 필요하다.

---

## 3. 기준 (새 법령 판단 없음)

- 함께 양도 묶음의 지분 자산은 「물건 전체(100%) 가액 입력 × 지분율」 — #2080에서 사용자가 정한 규약을 전 자산 지분 묶음에도 그대로 쓴다.
- 축 B(같은 물건 지분 분할)의 계산은 바꾸지 않는다.

---

## 4. 설계안

### D-1. 사용자의 선택을 폼에 저장

- `TransferFormData`에 `assetSplitMode?: "companion" | "fractional"`(이름은 Design에서 확정). 토글 A·B 핸들러가 `splitMode`와 **같은 onChange 패치**로 쓴다(useEffect 미러링 금지).
- `Step1`의 `splitMode` 초기값: 필드가 있으면 그 값, 없으면 현행 추론(`isFractionalSplitRestorable`).
- 단건(`assets.length === 1`)은 필드를 지운다(토글 해제 경로).

### D-2. 판정 단일 소스

- `isFullFractionalBundle`을 폼 단위로 바꾼다 — `form.assetSplitMode`가 있으면 그것(`"fractional"` + 다자산), 없으면 현행 지분율 추론.
  호출 지점 11곳(§2.2)이 같은 함수를 부르게 한다.

### D-3. 서버에 명시 플래그

- 본문에 `fractionalSplitBundle?: boolean`(⑬). ⑫·⑭는 플래그가 있으면 그것, 없으면 현행 본문 모양 추론.
- 함께 양도 + 전 자산 지분이면 ④가 `false`를 실어 route가 축 B로 읽지 않게 한다.

### D-4. 검증 문구

- 「지분 분할 취득: 전체 지분율 합계 100%」는 축 B에서만 — D-2로 자동 해결(별도 변경 없음, anchor로 확인).

### 14 동기화 지점

| 지점 | 내용 |
|---|---|
| ① 폼 상태 | `assetSplitMode` 필드 |
| ② initial | 미지정(undefined) |
| ③ normalize·migrate | 없으면 그대로(추론 유지) — 기존 세션·이력 값 불변 |
| ④ API 변환 | D-2 판정 + 본문 플래그 |
| ⑤ UI | `Step1` 토글 핸들러가 함께 기록 · 초기값 |
| ⑥ 사이드바 · ⑦ 결과 카드 | 서버 결과(`soleSplitAcquisition` 등)를 읽으므로 변경 없음 — Do에서 역방향 grep으로 확인 |
| ⑧ validation | D-2 판정 |
| ⑨⑩⑪ | 해당 없음(enum·자산 수준 날짜 아님) |
| ⑫ Zod | `fractionalSplitBundle` 선택 필드 + 면제 판정 |
| ⑬ 본문 | 플래그 전송 |
| ⑭ route | 플래그 우선 판정 |

---

## 5. 결정 필요

### Q-1 판정 근거

| 안 | 내용 | 평가 |
|---|---|---|
| **A (권고)** | 사용자의 선택을 폼에 저장 + 본문 명시 플래그 | 화면이 이미 따르는 값이다. 지분율 합 100% 사례(P1)와 100% 아닌 사례(P2) 모두 해결 |
| B | 데이터 추론 보강 — 소재지가 같으면 같은 물건 | 소재지는 필수 입력이지만(`transfer-tax-validate-asset.ts:149-150`) 같은 지번의 주택과 부수토지를 함께 양도하면 **다른 자산인데 소재지가 같다**. 도로명·지번 표기 차이도 있다 |
| C | 함께 양도에서 전 자산 지분을 막는다 | P2 같은 정당한 입력이 계속 계산 불가 |

### Q-2 저장 필드가 없는 기존 세션·이력

| 안 | 내용 |
|---|---|
| **A (권고)** | 현행 추론 유지 — 기존 결과·재계산 값 불변. 사용자가 Step1에서 토글을 다시 만지면 그때부터 저장 |
| B | 함께 양도로 간주 — 진짜 축 B로 저장된 기존 데이터가 깨진다 |

### Q-3 축 B 진입 직후(지분율 빈칸)·토글 전환 시

- 토글 B를 켜면 `"fractional"`, 토글 A를 켜면 `"companion"`, 둘 다 끄면(단건) 필드 삭제 — 현행 핸들러의 상태 전이 그대로 저장만 덧붙인다. 권고: 이대로(별도 화면 변경 없음).

---

## 6. 기존 테스트 영향

- 필드·플래그가 없으면 현행 판정 그대로라, 기존 테스트 입력(필드 없음)의 기대값은 바뀌지 않는 설계다 — Do-2에서 전체 실행으로 확인한다.
- 시제품은 판정을 강제로 끄는 전역 스위치였으므로 기존 테스트 영향 측정에는 쓰지 않았다.

---

## 7. 단계 (Do)

```
Do-1  anchor 선작성(RED) — P1·P2·T1·T2 (함께 양도 + 전 지분 → 함께 양도 값) · 축 B 대조군(같은 입력 + 지분별 취득 → 현행 값) · 필드 없음 → 현행 값   → verify: 현행에서 RED/대조군 GREEN
Do-2  ①②③ 필드 + D-2 판정 단일 소스 + ④⑧ 호출 11곳                                                                   → verify: 기존 전체 vitest 변화 0
Do-3  ⑫⑬⑭ 명시 플래그                                                                                                → verify: Do-1 GREEN
Do-4  ⑤ Step1 토글 기록 + 초기값                                                                                       → verify: 세션 복원 anchor(필드 있음/없음)
Do-5  check:pre-pr + 뮤테이션(플래그 무시 · 판정 폴백 반전 · 토글 기록 누락)                                            → verify: 각 변형이 anchor에서 잡힘
Do-6  화면 확인(Playwright) — 함께 양도로 50%·50% 토지 2건 → 자산별 양도가액·총세액이 T1과 같음, 지분별 취득 토글로 같은 값 → 현행 값   → verify: 두 경로 값
```

---

## 8. 범위 밖 · 확인 필요

- 주택 사례(고가주택 기준금액 안분의 분모 — P1에서 10억 ↔ 12억)의 세액 영향 — 측정 안 함(Do-1 anchor 후보).
- 다건(multi) 편집은 함께 양도 자산을 지원하지 않는다(`MULTI_COMPANION_UNSUPPORTED_MESSAGE`) — 해당 없음.
- 지분율 데이터 추론(`isFractionalSplitRestorable` 등)과 `reverse-appurtenant-house.ts`의 `isFractionalSplitBundle`은 같은 구조의 술어가 세 벌이다(memory 「술어 공유≠단일 소스」). 이번에 D-2로 합칠지는 Design에서 정한다.

---

## 9. Do 결과 (2026-10-18)

### 9.1 구현

| 지점 | 변경 |
|---|---|
| ① | `TransferFormData.assetSplitMode?: "companion" \| "fractional"` (`calc-wizard-form.types.ts`) |
| ②③ | 기본값 없음 · `migratePersistedTransferForm`이 저장값을 그대로 펼친다(테스트로 고정) |
| 판정 | `isFullFractionalBundle(assets, declaredMode?)` — `"companion"`이면 false, 그 밖은 종전 지분율 추론. 호출 11곳 전부 선택값을 넘긴다(`buildGeneralBuildingShares`·`sameDayHousingBundleIssue` 인자 추가) |
| ⑬ | `buildBundledPrimaryPayload`가 `fractionalSplitBundle` 전송 |
| ⑫ | `fractionalSplitBundle: z.boolean().optional()` · 양도가액 모드 면제 판정이 플래그 우선 · 다건 키 분류(`MULTI_IGNORED_KEYS`)에 등록 |
| ⑭ | route `isFullFractionalBundle = data.fractionalSplitBundle ?? 모양 추론` |
| ⑤ | `Step1` — 초기값은 저장된 선택 우선, 토글 A·B 핸들러와 자산 수정 핸들러(`updateAssets`)가 같은 패치로 기록(종전 세션도 자산을 고치는 순간 화면 모드가 저장된다). useEffect 없음 |
| ⑥ | **계획에서 「변경 없음」으로 봤으나 결함이 있었다** — 사이드바 계산 **전** 미리보기가 지분 자산이면 모두 「총액 × 지분」이었다(#2080이 ④만 고침). ④와 같은 판정·같은 곱셈으로 맞췄다: 축 B만 자동가, 함께 양도 지분 자산은 실거래가 × 지분 / 안분 키 = 기준시가 × 지분. 계산 **후**는 종전에도 서버 값이라 맞았다 |
| ⑦ | 결과 화면은 서버 결과를 읽는다 — 변경 없음 |
| ⑧ | 판정 함수 경유로 해결(「지분 분할 취득: 합계 100%」는 축 B에서만) |

### 9.2 검증

| 항목 | 결과 |
|---|---|
| anchor `transfer.route.companion-all-fractional-distinct.anchor.test.ts` (9건) | 처음 7건 중 현행 RED 5 → 전부 GREEN(보강 2건 포함). T1 218,724,000 · T2 215,952,000 · P2 계산됨 · 축 B 대조군 229,812,000 · 선택 미저장 = 종전 · ⑫ 플래그 면제 · 저장 복원 |
| UI `step1-asset-split-mode-persist.ui.test.tsx` (5건) | 토글 기록 · 해제 · 저장값 복원 · 미저장 대조군 · 종전 세션 자산 수정 시 기록 |
| 사이드바 `companion-share-sidebar-preview.anchor.test.ts` (5건) | 전 자산 지분 함께 양도 · #2080 혼합 실거래·안분 · 축 B 대조군 |
| `check:pre-pr` | 3,072파일 36,303 passed · lint 0 error(경고 359 = master) |
| 화면(Playwright, 워크트리 dev 3218) | A 저장된 선택 companion → 플래그 false · 6억·4억 · 총세액 218,724,000 / B 종전 세션(자산2 단독)에서 자산2 지분율을 50%로 고침 → 같은 값 |

뮤테이션(백업 복원 방식) 8종 전부 검출:

| 변형 | 잡은 테스트 |
|---|---|
| M1 판정이 선택 무시 | anchor 6건 |
| M2 route가 플래그 무시 | anchor T1(축 B 표지 `soleSplitAcquisition`) — 처음엔 생존(④가 이미 함께 양도 값을 보내 안분이 같다) → 단언 추가 |
| M3 ⑫가 플래그 무시 | ⑫ 면제 테스트 — 처음엔 생존(④가 언제나 필요한 칸을 채운다) → 본문 직접 테스트 추가 |
| M4 ④가 플래그 누락 | anchor 2건 |
| M5 Step1 초기값이 선택 무시 | UI 1건 |
| M6 토글이 선택 기록 누락 | UI 1건 |
| M7 자산 수정 핸들러 기록 누락 | UI 1건 — 처음엔 생존 → 테스트 추가 |
| M8 사이드바가 축 B 구분 무시 | 사이드바 2건 |

### 9.3 기존 테스트 갱신 (판정 기록)

| 테스트 | 종전 | 지금 | 판정 |
|---|---|---|---|
| `__tests__/lib/transfer-per-asset-summary.test.ts` A-9 (지분 50% 주택 + 단독 토지, 기준시가 안분) | 미리보기 112,500,000 · 112,500,000(총액 × 지분), 지분 자산 「안분 아님」 | **96,428,571 · 128,571,429**, 둘 다 「기준시가 안분」 | 실제 route 실측과 같다 — 종전 기대는 #2080 전 규칙 |
| `__tests__/api/transfer.route.multi-key-coverage-f12.test.ts` | — | 새 키 `fractionalSplitBundle`를 다건 무효과 목록에 근거와 함께 등록 | 다건은 컴패니언을 거부하므로 읽히지 않는다 |
