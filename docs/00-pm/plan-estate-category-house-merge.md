# 계획서 — 재산 종류 메뉴 간소화 + 주택 통합

> 작성일: 2026-06-08 · 대상: 상속·증여 재산 추가 메뉴 (`PropertyValuationForm`)
> 요청: 메뉴 버튼 간소화 + 단독주택을 아파트·공동주택과 "주택"으로 통합

## 결정 사항 (인터뷰)
- enum 키: **유지 + 라벨만 변경** (데이터는 시험용, 마이그레이션 불필요 / 코드 변경 최소·numeric 0)
- 메뉴: **컴팩트 1단 그리드** (버튼 가로 배치·높이↓)

## 근거 (실측)
- 토지·건물·아파트 3카테고리 모두 동일 위젯(`EstateBodyRealEstate`) — 차이는 라벨/안내문뿐.
- building·apartment 는 내부에서 이미 동일(단일 standardPrice) 처리. → numeric 영향 0.
- 단독주택(개별주택가격)은 평가 소스가 아파트(공동주택가격)와 같은 "주택공시가격" 계열 → "주택" 통합이 평가 논리에도 부합.

## 변경 라벨
| enum 키(유지) | 기존 라벨 | 변경 라벨 | 아이콘 |
|---|---|---|---|
| `real_estate_apartment` | 아파트·공동주택 | **주택** (아파트·공동·단독) | 🏠 |
| `real_estate_building` | 건물 (단독주택·상업용) | **상업용 건물** | 🏢 |
| `real_estate_land` | 토지 | 토지 (유지) | 🏔 |

## 작업 항목
1. `PropertyValuationForm.tsx` — `CATEGORY_LABELS`·`CATEGORY_ICONS` 수정(아이콘 swap: 주택🏠/상업용🏢)
2. `CategoryButton` 컴팩트화 — 세로(flex-col)→가로(flex-row) 한 줄, 패딩·아이콘 축소
3. `EstateBodyRealEstate.tsx` — `*_TITLE`/`*_HINT` 안내문 정합화 (apartment="주택 기준시가(공동주택가격·개별주택가격)", building="상업용 건물 기준시가")
4. 결과/다이얼로그 라벨맵 동기화 — `InheritanceTaxResultView.tsx:103`, `GiftTaxResultView`(있으면), `CategoryChangeDialog.tsx:36`
5. E2E 스펙 라벨 업데이트 — "아파트·공동주택" 사용 7개 스펙 → "주택"
6. 검증 — `tsc` 0 / `eslint` 0 / 상속·증여 회귀 / 관련 E2E

## 비대상 (그대로 유지)
- "아파트·공동주택가격" 평가 **소스 용어**(부수토지 포함 안내 등 CohabitAncillaryLandBlock·주석)는 평가 정확성 표현이므로 변경하지 않음.
- enum 키·엔진·평가 로직·14 동기화 지점 무변경 (라벨/UI만).
