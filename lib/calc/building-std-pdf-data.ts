/**
 * 서버 PDF용 「건물 기준시가 계산서」 모델 어댑터 (순수·서버 안전 — "use client" 없음).
 *
 * 저장된 input_data.buildingStdSnapshots(모달 입력 스냅샷)에서 엔진 결과·계산서 모델을 재유도한다.
 * 클라이언트 결과탭(BuildingStdPriceReportSection)과 동일한 재유도 경로 — 단일 출처.
 */
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import { toEngineInput, buildNtsReportContext } from "@/lib/calc/building-std-price-form";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { buildNtsReportModel, type NtsReportModel } from "@/lib/calc/nts-report-adapter";

/** input_data 안의 buildingStdSnapshots → 계산서 모델 목록(없거나 불완전하면 빈 배열). */
export function buildBuildingStdReportsFromInput(
  inputData: Record<string, unknown> | undefined,
): NtsReportModel[] {
  if (!inputData) return [];
  const snaps = (inputData as { buildingStdSnapshots?: Record<string, BuildingStdPriceFormState> })
    .buildingStdSnapshots;
  if (!snaps || typeof snaps !== "object") return [];
  const out: NtsReportModel[] = [];
  for (const snap of Object.values(snaps)) {
    try {
      const result = calcBuildingStandardPrice(toEngineInput(snap));
      const model = buildNtsReportModel(buildNtsReportContext(snap), result);
      if (model.instances.length > 0) out.push(model);
    } catch {
      // 스냅샷이 불완전/구버전이면 graceful 생략.
    }
  }
  return out;
}
