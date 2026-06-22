# 건물 기준시가 모달 — 입력 스냅샷 저장·복원 (정정 지원)

> 작성일: 2026-06-22
> 범위: 상속·증여(보충평가) + 양도(상업용·일반건물) "건물 기준시가 계산" 모달
> 결정: 양 세목 모두(사용자 선택). 새로고침 후에도 복원.

## 1. 문제
모달로 건물 기준시가를 계산·적용하면 결과 총액만 저장되고, 계산에 쓴 상세 입력(신축연도·구조·용도·복합 부분·면적·공시지가 등)은 보관되지 않는다. 모달 닫힘 시 `BuildingStdPriceForm`이 언마운트되며 내부 `useState`가 초기화(`BuildingStdPriceModalButton.tsx:58`, `BuildingStdPriceForm.tsx:121-138`). 총액으로는 상세 입력 역산 불가 → 정정하려면 전부 재입력.

## 2. 설계 (키 기반 스냅샷 스토어 — 타입/initial/normalize/Zod 무변경)
`EstateItem`/`AssetForm`에 필드를 추가하지 않고, **스냅샷 전용 zustand 스토어**(sessionStorage persist)를 신설해 모달 버튼이 `snapshotKey`로 내부에서 읽기/쓰기. 호출부는 `snapshotKey`만 추가.

- 신규 `lib/stores/building-std-snapshot-store.ts`: `Record<key, BuildingStdPriceFormState>` + `saveSnapshot(key, snap)`. persist(sessionStorage).
- `BuildingStdPriceForm`: `initialForm?: Partial<BuildingStdPriceFormState>` prop 추가(초기 state 병합, 기존 호출부 무영향) + `onResult` 6번째 인자 `formSnapshot`(현재 폼 state) 추가.
- `BuildingStdPriceModalButton`: `snapshotKey?: string` 추가. open 시 스토어에서 스냅샷 읽어 `initialForm`으로 주입, `onResult`의 formSnapshot 보관, **적용 시 `saveSnapshot(key, snap)`**.
- 호출부 5곳에 `snapshotKey` 부여:
  - 상증 보충평가: `bsp-estate-${item.id}`
  - 양도 GeneralBuildingBlock: `bsp-${asset.assetId}-gb-acq` / `-gb-transfer`
  - 양도 CommercialBuildingBlock: `bsp-${asset.assetId}-cb-acq` / `-cb-transfer`

키 안정성: `EstateItem.id`·`AssetForm.assetId`(factory 부여, 영속). 새로고침 후에도 동일 키 → 복원 유지.

## 3. 무영향(검증) — 엔진/Zod/API/validate/migrate 변경 없음
스냅샷은 별도 스토어에만 존재 → API body·엔진 input·EstateItem/AssetForm 직렬화 경로에 진입하지 않음. onResult/initialForm은 additive(기존 4·5인자 콜백·미전달 호출부 그대로 동작).

## 4. 검증
- `tsc --noEmit` 0건.
- E2E(상증): 모달 복합구조 계산·적용 → 모달 재오픈 시 신축연도·부분·면적·공시지가 복원 확인.
- E2E(양도): 일반/상업용 건물 취득·양도시 모달 각각 독립 복원(키 분리) 확인.
- 회귀: 기존 building-standard-price·cb-* spec 통과.
