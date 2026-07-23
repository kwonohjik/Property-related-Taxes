/**
 * PHD 3시점 일괄 산출 → 건물 기준시가 계산서 스냅샷 재구성.
 *
 * 계획서: docs/02-design/features/building-std-report-result-tab-phd-batch.plan.md
 * anchor: __tests__/calc/phd-batch-snapshots.test.ts
 *
 * 일괄 모달은 최종 금액만 필드에 적용하므로, 결과탭 계산서(BuildingStdPriceReportSection)가
 * 재유도할 수 있도록 각 (시점, 카테고리)를 `BuildingStdPriceFormState`(valuation 모드) 스냅샷으로
 * 재구성한다. 재유도 총액 = 배치 적용 금액(자기일관성) — 규율:
 *  - (A) 단일부분 floorArea = 카테고리 부분 소계.  - (B) 시점당 1스냅샷.
 *  - (C) ≤2000 취득·최초공시(acqBase, §164⑤ 산정기준율 환산)는 valuation 재현 불가 → transfer 모드
 *        스냅샷으로 생성(44f8e211 취득 → 최초공시 확장: 2001 기준 공시지가=landPrice2001PerM2).
 *  - (D) Case A 상가 취득·최초공시는 당시 주택 용도(acqFirstUsageNo)로 매핑.
 */
import {
  initialBuildingStdPriceForm,
  emptyCompositePart,
  type BuildingStdPriceFormState,
} from "@/lib/calc/building-std-price-form";
import {
  BUILDING_STD_FIRST_YEAR,
  partAtPoint,
  type PhdBatchInput,
  type PhdBatchPart,
  type PhdBatchPoint,
  type PointKey,
  type ResolvedPart,
} from "@/lib/calc/phd-building-std-batch";

/** 시점 해석된 부분목록 + 시점 → valuation 모드 스냅샷(배치 엔진 호출과 동일 입력형). */
function buildValuationSnapshot(
  parts: ResolvedPart[],
  builtYear: number,
  point: PhdBatchPoint,
): BuildingStdPriceFormState {
  const head = parts[0];
  const composite = parts.length > 1;
  const sumArea = parts.reduce((s, p) => s + p.floorArea, 0);
  return {
    ...initialBuildingStdPriceForm,
    taxType: "inheritance_gift",
    inheritanceGiftKind: "inheritance",
    builtYear: String(builtYear),
    valuationYear: String(point.year),
    valLandPrice: String(point.landPricePerM2),
    // 단일: head 면적 / 복합: 합계(복합에선 top-level floorArea 미사용, 각 part 면적 사용)
    floorArea: String(composite ? sumArea : head.floorArea),
    valStructureKey: head.structureKey,
    valUsageNo: String(head.usageNo),
    adjustmentMode: "manual",
    compositeMode: composite,
    compositeParts: composite
      ? parts.map((p) => ({
          ...emptyCompositePart(),
          structureKey: p.structureKey,
          usageNo: String(p.usageNo),
          floorArea: String(p.floorArea),
        }))
      : [emptyCompositePart()],
  };
}

/**
 * 취득 ≤2000 단독 주택분 → transfer 모드 acqBase 스냅샷.
 * valuation 서식으로 재현 불가한 산정기준율 환산(소령 §164⑤)을 국세청 계산서 ※표로 출력하기 위해
 * transfer 모드(취득<2001 → 엔진 acqBase 경로)로 스냅샷을 만든다. transfer point는 2001 dummy
 * (§164⑧ 동일연도 회피 — 취득년≠2001)로 취득 point를 복사하며, 결과탭 렌더 단계에서 양도 dummy
 * 인스턴스는 필터로 제거하고 취득(acq2000) 인스턴스만 노출한다.
 */
function buildTransferAcqSnapshot(
  part: ResolvedPart,
  builtYear: number,
  point: PhdBatchPoint,
): BuildingStdPriceFormState {
  return {
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    builtYear: String(builtYear),
    floorArea: String(part.floorArea),
    acquisitionYear: String(point.year),
    transferYear: String(BUILDING_STD_FIRST_YEAR), // 2001 dummy
    acqStructureKey: part.structureKey,
    acqUsageNo: String(part.usageNo),
    acqLandPrice: String(point.landPricePerM2),
    transStructureKey: part.structureKey, // dummy 복사
    transUsageNo: String(part.usageNo),
    transLandPrice: String(point.landPricePerM2),
  };
}

/**
 * 복합(다부분) 취득 ≤2000 → transfer 모드 acqBase 스냅샷. buildTransferAcqSnapshot의 복합판.
 * 각 부분은 transfer 복합 경로가 요구하는 `usageNo`(양도)·`acqUsageNo`(취득) 둘 다 채운다
 * (시점 해석 완료된 용도 → 동일값). 단일 산정기준율 그룹만 유효(엔진 제약, 다그룹은 재유도 throw→미표시).
 */
function buildTransferAcqCompositeSnapshot(
  parts: ResolvedPart[],
  builtYear: number,
  point: PhdBatchPoint,
): BuildingStdPriceFormState {
  const head = parts[0];
  const sumArea = parts.reduce((s, p) => s + p.floorArea, 0);
  return {
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    builtYear: String(builtYear),
    floorArea: String(sumArea),
    acquisitionYear: String(point.year),
    transferYear: String(BUILDING_STD_FIRST_YEAR), // 2001 dummy
    acqStructureKey: head.structureKey,
    acqUsageNo: String(head.usageNo),
    acqLandPrice: String(point.landPricePerM2),
    transStructureKey: head.structureKey,
    transUsageNo: String(head.usageNo),
    transLandPrice: String(point.landPricePerM2),
    compositeMode: true,
    compositeParts: parts.map((p) => ({
      ...emptyCompositePart(),
      structureKey: p.structureKey,
      usageNo: String(p.usageNo),
      acqUsageNo: String(p.usageNo), // transfer 복합 필수(미세팅 시 엔진 throw)
      floorArea: String(p.floorArea),
    })),
  };
}

/**
 * 배치 입력 → 스냅샷 맵. 키: `${prefix}-{acq|first|transfer}[-commercial]`.
 * computePhdThreePointStdPrice와 동일한 시점×카테고리 산정 로직을 미러(산출되는 슬롯만 스냅샷 생성).
 */
export function phdBatchToSnapshots(
  input: PhdBatchInput,
  prefix: string,
): Record<string, BuildingStdPriceFormState> {
  const { building, acquisition, firstDisclosure, transfer, landPrice2001PerM2 } = input;
  const { builtYear, parts } = building;
  const housing = parts.filter((p) => p.category === "housing");
  const commercial = parts.filter((p) => p.category === "commercial");
  const out: Record<string, BuildingStdPriceFormState> = {};

  const KEYWORD: Record<PointKey, "acq" | "first" | "transfer"> = {
    acquisition: "acq",
    firstDisclosure: "first",
    transfer: "transfer",
  };

  // ≥2001 valuation 재현 가능한 시점만 스냅샷 생성(≤2000 acqBase는 C조건으로 생략).
  // 각 부분을 해당 시점 구조·용도로 해석(partAtPoint 공유) — 미지정 부분 제외.
  const add = (
    key: PointKey,
    category: "housing" | "commercial",
    catParts: PhdBatchPart[],
    point: PhdBatchPoint | undefined,
  ) => {
    if (!point || catParts.length === 0) return;
    const resolved = catParts.map((p) => partAtPoint(p, key)).filter((r): r is ResolvedPart => r != null);
    if (resolved.length !== catParts.length) return; // 시점 미입력(Case B 상가 등) → 스냅샷 생략
    const snapKey = `${prefix}-${KEYWORD[key]}${category === "commercial" ? "-commercial" : ""}`;
    if (point.year < BUILDING_STD_FIRST_YEAR) {
      // 취득·최초공시 ≤2000 acqBase transfer 스냅샷(양도<2001은 생략 — 배치 unsupported와 미러).
      //  - 취득: point.landPricePerM2(UI가 2001 기준으로 고정) 그대로.
      //  - 최초공시: landPrice2001PerM2(2001 기준) 필수 — 부재 시 배치도 unsupported이므로 스냅샷 생략(미러).
      //  - 단일부분: 주택 단독·상가 Case A(시점 구조·용도 지정 시 resolved 채워짐, Case B는 상단에서 걸러짐).
      //  - 복합 다부분: buildTransferAcqCompositeSnapshot(단일 산정기준율 그룹만 유효 — 다그룹은 재유도 throw→미표시).
      const effPoint =
        key === "acquisition"
          ? point
          : key === "firstDisclosure" && landPrice2001PerM2 != null && landPrice2001PerM2 > 0
            ? { year: point.year, landPricePerM2: landPrice2001PerM2 }
            : undefined;
      if (effPoint) {
        out[snapKey] =
          resolved.length === 1
            ? buildTransferAcqSnapshot(resolved[0], builtYear, effPoint)
            : buildTransferAcqCompositeSnapshot(resolved, builtYear, effPoint);
      }
      return;
    }
    out[snapKey] = buildValuationSnapshot(resolved, builtYear, point);
  };

  // housing — 3시점
  add("acquisition", "housing", housing, acquisition);
  add("firstDisclosure", "housing", housing, firstDisclosure);
  add("transfer", "housing", housing, transfer);

  // commercial — 양도 항상 / 취득·최초공시는 시점 구조·용도(Case A 주택 값)가 지정됐을 때만
  add("transfer", "commercial", commercial, transfer);
  add("acquisition", "commercial", commercial, acquisition);
  add("firstDisclosure", "commercial", commercial, firstDisclosure);

  return out;
}
