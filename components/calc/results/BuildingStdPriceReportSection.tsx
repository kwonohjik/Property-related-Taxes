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
import { BUILDING_STD_FIRST_YEAR } from "@/lib/calc/phd-building-std-batch";
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
        let model = buildNtsReportModel(buildNtsReportContext(snap), result);
        // phd override(markCell acq2000·연도 라벨)는 phd-acq 전용.
        const isTransferAcq = snap.taxType === "transfer" && /-phd-acq(-commercial)?$/.test(key);
        // 시점 전용 스냅샷의 반대 시점 인스턴스 제거 — 엔진 transfer 2시점 모드가 양도+취득 2벌을 내므로,
        // 취득 전용 키는 취득 인스턴스만, 양도 전용 키는 양도 인스턴스만 노출한다.
        // (한 자산이 -acq·-transfer 2스냅샷을 가지므로 필터 없으면 취득·양도 각 2벌 중복)
        //
        // ⚠️ 키 접두는 **전수 열거**한다 — 누락되면 조용히 2벌이 출력된다.
        //    2026-07-29 실측으로 split-acq·split-transfer(토지·건물 분리)·cbinh-acq(상속취득 상가)
        //    3종이 빠져 있던 것을 편입. 신규 스냅샷 키 규약 추가 시 여기도 함께 갱신할 것.
        //    (단일 시점 모드 스냅샷은 엔진이 애초에 1벌만 내지만, 그 이전 저장분은 여전히 2벌이다.)
        if (snap.taxType === "transfer") {
          if (/-(phd|gb|cb|cbinh|split)-acq(-commercial)?$/.test(key)) {
            model = { ...model, instances: model.instances.filter((i) => i.markCell !== "transfer") };
          } else if (/-(gb|cb|split)-transfer$/.test(key)) {
            model = { ...model, instances: model.instances.filter((i) => i.markCell === "transfer") };
          }
        }
        if (model.instances.length === 0) continue;
        // 감면 PHD 환산 통합 스냅샷(-red-phd) — 취득시·최초공시시 2 인스턴스를 시점별 계산서로 분리.
        // §164⑤ 환산은 두 시점 모두 "취득 시점 측" 기준시가이므로 양도당시(transfer) 마킹이 아닌
        // 취득당시 칸에 마킹(취득시=연도별 acq2000/acq2001, 최초공시일=acq2001).
        if (/-red-phd$/.test(key)) {
          const acqInst = model.instances.find((i) => i.markCell !== "transfer");
          const firstInst = model.instances.find((i) => i.markCell === "transfer");
          const acqIsPre2001 = Number(snap.acquisitionYear) < BUILDING_STD_FIRST_YEAR;
          if (acqInst) {
            out.push({
              key: `${key}-acq`,
              model: { ...model, instances: [acqInst] },
              titleOverride: "취득시 (감면 PHD 환산 §164⑤)",
              markCellOverride: acqIsPre2001 ? "acq2000" : "acq2001",
              rank: 200 + seq,
            });
          }
          if (firstInst) {
            out.push({
              key: `${key}-first`,
              model: { ...model, instances: [firstInst] },
              titleOverride: "최초공시일 (감면 PHD 환산 §164⑤)",
              markCellOverride: "acq2001",
              rank: 201 + seq,
            });
          }
          seq += 2;
          continue;
        }
        // PHD 3시점(일괄) 스냅샷은 시점·주택/상가 라벨을 헤딩으로 명시(양도·상속 공용) — C1.
        // "양도" 접두는 제거: 상속취득 경로에서도 동일 서식을 쓰므로 시점명만 표기.
        const tp = phdTimepointLabel(key);
        // 연도 라벨: valuation 스냅샷은 valuationYear, transfer 취득 스냅샷은 acquisitionYear(valuationYear 부재).
        const yearLabel = snap.valuationYear || (isTransferAcq ? snap.acquisitionYear : "");
        const titleOverride = tp
          ? `${tp.timepoint} · ${tp.category === "commercial" ? "상가분" : "주택분"}${yearLabel ? ` (${yearLabel}년)` : ""}`
          : undefined;
        // Ⅰ.구분 마킹 — 상속(재구성 taxType) 대신 양도 맥락으로: 취득시·최초공시일=취득당시(2001↑), 양도시=양도당시.
        // 취득 ≤2000 transfer 스냅샷은 acq2000(2000.12.31 이전) 칸에 마킹.
        const markCellOverride: NtsReportInstance["markCell"] | undefined = tp
          ? tp.timepoint === "양도시"
            ? "transfer"
            : isTransferAcq && Number(snap.acquisitionYear) < BUILDING_STD_FIRST_YEAR
              ? "acq2000"
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
