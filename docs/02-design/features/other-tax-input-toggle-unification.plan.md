# 양도·취득·재산·종부·주식양도세 입력 폼 — 펼치기/접기 토글 표준 통일 계획서

> 작성 2026-06-15, **재검증 정정 2026-06-15**. 상속·증여 입력 폼 통일(✅PR#185·#186)의 후속.
> ⚠️ **1차 조사 거짓 0건 정정**: zsh가 `$VAR` 경로 변수를 단어분할하지 않아 native details·Chevron·aria-expanded grep이 전부 빈 결과였음. **경로를 직접 나열**해 재조사 → 대상이 4곳이 아니라 **11곳**으로 확정. (교훈: grep 경로는 변수 대신 직접 나열하거나 `${=VAR}`.)

## 1. 결론 — 조사 요약 (재검증)

| 패턴 | 건수 | 위치 |
|---|---|---|
| 화살표 문자 실토글 | **4곳** | transfer 2(UnifiedReductionPanel·**Step6**) · stock-transfer 2(Kiwoom×2) |
| 제목 장식 ▼ (토글 아님→제거) | **1곳** | stock-transfer KiwoomMarketCapHelper |
| native `<details>/<summary>` | **6곳** | transfer 1 · stock-transfer 5 |
| **합계 (표준화/제거 대상)** | **11곳** | transfer 3 · stock-transfer 8 |
| 이미 표준(`expandToggleClass`) | 1 | building-std-price NtsReport (대상 아님) |
| lucide Chevron | 7 | 전부 네비/탭 아이콘 (토글 아님, 대상 아님) |

→ **취득세·재산세·종합부동산세 입력 폼엔 통일 대상 토글 0건.** 작업은 transfer 3 + stock-transfer 8 = 11곳.

## 2. 표준 토글 명세 (기존과 동일)

단일 출처 `components/calc/results/shared/ExpandToggleButton.tsx` — `expandToggleClass(tone)` + `expandToggleLabel(open)`(▼펼치기/▲접기), tone 7종. native `<details>`는 useState+button 변환(상속 PR#186 패턴). 상세는 메모리 `feedback_result_expand_toggle_standard`.

## 3. 통일 대상 인벤토리 (실측 — Do 착수 시 재grep)

### 3-A. 화살표 문자 실토글 (4곳 — 표준화)

| 대상 | 위치 | 현재 | 구조 | tone | 패턴 |
|---|---|---|---|---|---|
| 감면 그룹 헤더 | `transfer/UnifiedReductionPanel.tsx:428` | `{isOpen ? "▼" : "▶"} {schema.title}` | `<button onClick={onToggleOpen}>` 헤더 전체, 우측 카운터 | slate | B — span 배지 |
| **고급 설정(가산세)** ★누락이었음 | `app/calc/transfer-tax/steps/Step6.tsx:117`(state :22, onClick :114) | `{showAdvanced ? "고급 설정 접기 ▲" : "고급 설정 (이자상당액 가산액) ▼"}` | `<button onClick={setShowAdvanced}>` | amber(가산세) 또는 slate | A — `{expandToggleLabel(showAdvanced)} · 고급 설정 (이자상당액 가산액)` |
| 일자별 종가 | `stock-transfer/KiwoomAutoFetchButton.tsx:212`(state :49) | `{showDetail ? "▲ 일자별 종가 숨기기" : "▼ 일자별 종가 상세 보기 (검증용)"}` | `<button onClick={setShowDetail}>`+본문 `{showDetail && ...}` | emerald | A — `{expandToggleLabel(showDetail)} · 일자별 종가 (검증용)` |
| 일자별 종가(상장후) | `stock-transfer/KiwoomPostListingAutoFetchButton.tsx:205`(state :47) | 동상 | 동상 | emerald | 동상 |

→ Kiwoom 2곳은 상속세 `KiwoomValuationResultCard`(✅PR#185)와 동일 패턴.

### 3-B. 제목 장식 ▼ (1곳 — 토글 아님, 제거)

| 대상 | 위치 | 현재 | 처리 |
|---|---|---|---|
| 시총 산식 검증 제목 | `stock-transfer/KiwoomMarketCapHelper.tsx:172` | `<p>▼ 시총 산식 검증 (시행령 §157①)</p>` | `<p>` 제목, onClick 없음 = 토글 아님 → 장식 `▼ ` 제거 |

### 3-C. native `<details>/<summary>` → button+state (6곳 — 변환)

상속 PR#186 패턴: 각 컴포넌트에 `useState` + `<button className={expandToggleClass(tone)}>{expandToggleLabel(open)} · 라벨</button>` + 본문 `{open && ...}`(모달·비인쇄) 또는 `hidden print:block`(인쇄 대상).

| 대상 | 위치 | summary 라벨 | tone | 비고 |
|---|---|---|---|---|
| 가업상속 이력 모달 | `transfer/FamilyBusinessInheritanceHistoryModal.tsx:259` | "제외된 이력 N건 보기" | slate(gray) | 모달 — 상속 PriorGiftHistoryModal "제외된 이력"과 동일 |
| 시총 힌트 | `stock-transfer/MajorShareholderCheckpointHints.tsx:23` (`MarketCapHintsCard`) | (sky 힌트) | sky | 4개 독립 export 컴포넌트 |
| 발행주식 힌트 | `MajorShareholderCheckpointHints.tsx:72` (`IssuedSharesHintsCard`) | (emerald 힌트) | emerald | |
| 특수법인 힌트 | `MajorShareholderCheckpointHints.tsx:105` (`SpecialEntityHintsCard`) | (rose 힌트) | rose | |
| 합산지분 힌트 | `MajorShareholderCheckpointHints.tsx:156` (`CombinedShareHintsCard`) | (amber 힌트) | amber | |
| 시기별 기준 이력 | `stock-transfer/MajorShareholderBlock.tsx:340` | "시기별 기준 이력 보기" | slate | `<MajorThresholdTimeline>` 감쌈 |

→ CheckpointHints 4개는 색조만 다른 동형 구조 → **공통 `<DetailsToggle tone>` 헬퍼 컴포넌트 추출** 권장(중복 4회 회피). 또는 각 함수에 useState 1개씩.

### 3-D. 대상 아님 (제외 — 검토 시 확인 완료)

| 항목 | 위치 | 사유 |
|---|---|---|
| NtsBuildingStdPriceReport | `building-std-price/nts-report/NtsBuildingStdPriceReport.tsx:69` | **이미 `expandToggleClass("slate")` 표준** |
| NBL "접기" | `transfer/nbl/NblSectionContainer.tsx:88` | 정밀판정 **모드 OFF 액션**(`nblUseDetailedJudgment=false`), 정보 펼침 토글 아님 |
| 1세대1주택자 | `app/calc/comprehensive-tax/Step1Basic.tsx:219` | **ToggleCard children**(ON/OFF 분기 입력) — 별개 |
| SigunguSelect·KiwoomStockNameAutocomplete | `transfer/nbl/shared/`·`stock-transfer/` | **autocomplete 드롭다운**(open state) |
| BuildingStdPriceModalButton | `building-std-price/` | **Dialog 모달** 열기 |
| AssetTabBar `<ChevronRight>` | `transfer/AssetTabBar.tsx:126` | 활성 탭 인디케이터 |
| `<ChevronLeft>` ×4 | `*Calculator`·`comprehensive-tax/page` | 뒤로가기 버튼 아이콘 |

### 3-E. 토글 0건 세목

`acquisition/`(취득세)·`property/`(재산세)·`comprehensive/`(종부세, ToggleCard 분기만) — 표준화 대상 토글 0건.

## 4. 작업 방식

- **UnifiedReductionPanel·Step6**: 헤더/버튼 onClick 유지, 라벨을 `expandToggleClass`+`expandToggleLabel`로. 중첩 button 금지(헤더 button이면 span).
- **Kiwoom 2곳**: 상속 `KiwoomValuationResultCard` 선례 그대로 emerald 알약.
- **KiwoomMarketCapHelper**: `<p>`의 `▼ ` 제거.
- **native details 6곳**: useState + button(expandToggleClass) + `{open && ...}`. CheckpointHints는 공통 헬퍼 추출.
- 정책: 정적 tone·중첩 button 금지·`useEffect→store` 미러링 없음·lucide/하드코딩 금지.

## 5. 예외

표 행 미세토글·정보 칩 해당 없음. NtsReport(이미 표준)·NBL 모드 액션·ToggleCard·드롭다운·모달·네비 아이콘은 §3-D대로 제외.

## 6. 검증 (DoD)

- [ ] 자가 점검 grep(**경로 직접 나열** — 변수 금지): `grep -rnE '▲|▼|▶|▾|▸' <경로들>` + `'<details|<summary'` + `'Chevron(Down|Up)'` → 표준 정의·제외(네비 아이콘·이미 표준·드롭다운·모달) 외 0건
- [ ] `tsc --noEmit` 0건 / lint 0 errors (Chevron 제거 시 미사용 import 정리)
- [ ] **변경 전 직접 렌더/textContent 테스트 동기화** (메모리 교훈):
  - ⚠️ `__tests__/components/calc/stock-transfer/share-ratio-calc.test.ts` 가 MajorShareholderBlock 렌더/“시기별 기준 이력” 본문 의존하는지 **Do 전 확인** 필수
  - 나머지(FamilyBusinessHistoryModal·CheckpointHints·Step6·Kiwoom) 직접 렌더 테스트 유무 재grep
- [ ] E2E selector 의존(transfer 감면·가산세 Step6·stock-transfer 대주주) 확인
- [ ] `npx vitest run` 통과 / 핵심 E2E 회귀 0

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| **grep 변수 단어분할(zsh)** | 경로 직접 나열·`${=VAR}`. 1차 거짓 0건 재발 방지 |
| line 드리프트 | Do 착수 시 재grep |
| CheckpointHints 4개 중복 | 공통 헬퍼 컴포넌트 추출로 일괄 |
| MajorShareholderBlock E2E/컴포넌트 테스트 | share-ratio-calc.test.ts·대주주 spec 사전 확인 |
| Step6 가산세 경로 E2E | showAdvanced 토글 onClick·본문 보존 |

규모: 실토글 4 + 장식 1 + native details 6 = 11곳. 단일 PR 가능하나 stock-transfer 비중 큼(8곳).
