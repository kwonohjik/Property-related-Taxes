"use client";

/**
 * 결과탭 「건물 기준시가 계산서」 서식 섹션 (양도·상속·증여 공용).
 *
 * 세목 엔진은 건물 기준시가를 직접입력으로만 받지만, 임베디드 모달(BuildingStdPriceModalButton)이
 * 적용 시점의 폼 입력을 useBuildingStdSnapshotStore에 키별 저장한다(이력 복원 시 동반 복원 — WS-4).
 * 이 섹션은 그 스냅샷에서 엔진 결과·계산서 모델을 **클라이언트 재유도**해 국세청 서식을 출력한다(엔진/API 무변경).
 *
 * 스냅샷 키: 상증 `bsp-estate-${id}` / 양도 `bsp-${assetId}-{gb|cb}-{acq|transfer}`.
 * inputData에 등장하는 id의 스냅샷만 이 계산 소속으로 렌더.
 */
import { useMemo } from "react";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import { toEngineInput, buildNtsReportContext } from "@/lib/calc/building-std-price-form";
import { idOfSnapshotKey, phdTimepointLabel } from "@/lib/calc/building-std-snapshot-keys";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { buildNtsReportModel, type NtsReportModel, type NtsReportInstance } from "@/lib/calc/nts-report-adapter";
import { NtsBuildingStdPriceReport } from "@/components/calc/building-std-price/nts-report/NtsBuildingStdPriceReport";

/** inputData에 소속된 건물 기준시가 스냅샷이 있으면 true (결과뷰 availablePrintIds 판정용). */
export function hasBuildingStdReport(inputData: Record<string, unknown> | undefined): boolean {
  if (!inputData) return false;
  const snapshots = useBuildingStdSnapshotStore.getState().snapshots;
  const keys = Object.keys(snapshots);
  if (keys.length === 0) return false;
  const inputStr = JSON.stringify(inputData);
  return keys.some((k) => {
    const id = idOfSnapshotKey(k);
    return id !== "" && inputStr.includes(id);
  });
}

interface Props {
  /** 현재 계산의 폼 입력(소속 스냅샷 필터용) */
  inputData: Record<string, unknown> | undefined;
}

export function BuildingStdPriceReportSection({ inputData }: Props) {
  const snapshots = useBuildingStdSnapshotStore((s) => s.snapshots);

  const reports = useMemo(() => {
    type ReportItem = {
      key: string;
      model: NtsReportModel;
      titleOverride?: string;
      markCellOverride?: NtsReportInstance["markCell"];
      rank: number;
    };
    if (!inputData) return [] as ReportItem[];
    const inputStr = JSON.stringify(inputData);
    const out: ReportItem[] = [];
    let seq = 0;
    for (const [key, snap] of Object.entries(snapshots)) {
      const id = idOfSnapshotKey(key);
      if (id === "" || !inputStr.includes(id)) continue;
      try {
        const result = calcBuildingStandardPrice(toEngineInput(snap));
        const model = buildNtsReportModel(buildNtsReportContext(snap), result);
        if (model.instances.length === 0) continue;
        // PHD 3시점(일괄) 스냅샷은 시점·주택/상가 라벨을 헤딩으로 명시(양도 맥락) — C1.
        const tp = phdTimepointLabel(key);
        const titleOverride = tp
          ? `양도 ${tp.timepoint} · ${tp.category === "commercial" ? "상가분" : "주택분"}${snap.valuationYear ? ` (${snap.valuationYear}년)` : ""}`
          : undefined;
        // Ⅰ.구분 마킹 — 상속(재구성 taxType) 대신 양도 맥락으로: 취득시·최초공시일=취득당시(2001↑), 양도시=양도당시.
        const markCellOverride: NtsReportInstance["markCell"] | undefined = tp
          ? tp.timepoint === "양도시"
            ? "transfer"
            : "acq2001"
          : undefined;
        // PHD는 취득→최초공시→양도, 주택→상가 순으로 정렬. 비-PHD는 삽입 순서 유지.
        const rank = tp
          ? ({ 취득시: 0, 최초공시일: 1, 양도시: 2 }[tp.timepoint] ?? 0) * 2 +
            (tp.category === "commercial" ? 1 : 0)
          : 100 + seq;
        seq++;
        out.push({ key, model, titleOverride, markCellOverride, rank });
      } catch {
        // 스냅샷이 불완전/구버전이면 graceful 생략 (서식 미표시).
      }
    }
    out.sort((a, b) => a.rank - b.rank);
    return out;
  }, [snapshots, inputData]);

  if (reports.length === 0) return null;

  return (
    <div className="space-y-6">
      {reports.map(({ key, model, titleOverride, markCellOverride }) => (
        <NtsBuildingStdPriceReport key={key} model={model} titleOverride={titleOverride} markCellOverride={markCellOverride} />
      ))}
    </div>
  );
}
