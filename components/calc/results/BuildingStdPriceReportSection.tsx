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
import {
  idOfSnapshotKey,
  isExtensionSnapshotKey,
  phdTimepointLabel,
  snapshotKeyTimepoint,
  snapshotKindLabel,
} from "@/lib/calc/building-std-snapshot-keys";
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
      /** 접힘 헤더의 건물 구분 — 시점만으로는 본체/증축분/상가가 같은 제목이 된다. */
      kindLabel?: string;
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
        // 배치 override(markCell acq2000·연도 라벨)는 **취득 시점 배치 스냅샷** 전용.
        // 배치 override(markCell acq2000·연도 라벨)는 **배치 전용 키**에만 적용된다.
        // `-cb-acq`·`-gb-acq`는 1시점 모달과 키를 공유해 제외한다(`phdTimepointLabel` 주석 참조) —
        // 그 키는 tp가 null이라 아래 override 자체가 발화하지 않는다.
        const isTransferAcq = snap.taxType === "transfer" && /-phd-acq(-commercial)?$/.test(key);
        // 시점 전용 스냅샷의 반대 시점 인스턴스 제거 — 판정은 `snapshotKeyTimepoint` 단일 소스.
        // PDF 경로(building-std-pdf-data)도 같은 함수를 쓴다(화면↔PDF 어긋남 방지).
        const keyTimepoint = snap.taxType === "transfer" ? snapshotKeyTimepoint(key) : null;
        if (keyTimepoint) {
          model = {
            ...model,
            instances: model.instances.filter((i) =>
              keyTimepoint === "transfer" ? i.markCell === "transfer" : i.markCell !== "transfer",
            ),
          };
        }
        if (model.instances.length === 0) continue;
        // PHD 환산 통합 스냅샷 — 취득시·최초공시시 2 인스턴스를 시점별 계산서로 분리.
        // 환산은 두 시점 모두 "취득 시점 측" 기준시가이므로 양도당시(transfer) 마킹이 아닌
        // 취득당시 칸에 마킹(취득시=연도별 acq2000/acq2001, 최초공시일=acq2001).
        //
        // 두 호출부가 같은 구조다 — 조문만 다르다:
        //   `-red-phd`   감면 조문 PHD 환산 (§164⑤) — ReductionPhdInput
        //   `-redev-phd` 재개발 §166③ 환산의 §164⑦ 본문 — RedevelopmentValuationSection
        // ⚠️ `-red-phd$`는 `-redev-phd`에 매칭되지 않는다(접미가 다르다) — 그래도 아래처럼
        //    긴 쪽(`redev`)을 먼저 시험해 `building-std-snapshot-keys.ts`의 열거 규율과 맞춘다.
        const phdConversionKind = /-redev-phd$/.test(key)
          ? { suffix: "재개발 환산 §164⑦" }
          : /-red-phd$/.test(key)
            ? { suffix: "감면 PHD 환산 §164⑤" }
            : null;
        if (phdConversionKind) {
          const acqInst = model.instances.find((i) => i.markCell !== "transfer");
          const firstInst = model.instances.find((i) => i.markCell === "transfer");
          const acqIsPre2001 = Number(snap.acquisitionYear) < BUILDING_STD_FIRST_YEAR;
          if (acqInst) {
            out.push({
              key: `${key}-acq`,
              model: { ...model, instances: [acqInst] },
              titleOverride: `취득시 (${phdConversionKind.suffix})`,
              markCellOverride: acqIsPre2001 ? "acq2000" : "acq2001",
              rank: 200 + seq,
            });
          }
          if (firstInst) {
            out.push({
              key: `${key}-first`,
              model: { ...model, instances: [firstInst] },
              titleOverride: `최초공시일 (${phdConversionKind.suffix})`,
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
        /**
         * 🔴 배치는 계산서를 **valuation(taxType=inheritance_gift) 스냅샷으로 재구성**한다.
         *    그래서 양도 계산인데도 제목이 "상속 건물 기준시가 계산"으로, Ⅰ.구분이 상속세 칸에
         *    찍힌다. 종전 override는 배치 전용 키(`-phd-*`·`-cb-first`)에만 걸려 있어서
         *    **일반건물 2시점 일괄(`-gb-acq`/`-gb-transfer`)이 그 그물을 빠져나갔다**
         *    (2026-08-11 브라우저 실측).
         *
         *    ⇒ 재구성 스냅샷이 **양도 자산 키**(시점 세그먼트가 있는 키)로 저장돼 있으면
         *       키의 시점으로 양도 맥락을 부여한다. 상증 키(`bsp-estate-*`)는
         *       `snapshotKeyTimepoint`가 null이라 걸리지 않는다(그쪽은 상속 맥락이 정답).
         */
        const reconstructedTimepoint =
          !tp && snap.taxType !== "transfer" ? snapshotKeyTimepoint(key) : null;
        /**
         * 증축분(건물2)은 원건물과 **같은 자산·같은 2시점**이라 구별 표기가 없으면
         * 「양도시」 계산서가 두 장 나란히 떠서 어느 쪽이 건물1인지 알 수 없다.
         * 취득 시점 이름도 다르다 — 증축분의 취득은 **증축일**이다(영 §162①4호).
         */
        const isExt = isExtensionSnapshotKey(key);
        const titleOverride = tp
          ? `${tp.timepoint} · ${tp.categoryLabel}${yearLabel ? ` (${yearLabel}년)` : ""}`
          : reconstructedTimepoint
            ? `${
                reconstructedTimepoint === "transfer"
                  ? "양도시"
                  : isExt
                    ? "증축시"
                    : "취득시"
              }${isExt ? " · 증축분(건물2)" : ""}${yearLabel ? ` (${yearLabel}년)` : ""}`
            : undefined;
        // Ⅰ.구분 마킹 — 상속(재구성 taxType) 대신 양도 맥락으로: 취득시·최초공시일=취득당시(2001↑), 양도시=양도당시.
        // 취득 ≤2000 transfer 스냅샷은 acq2000(2000.12.31 이전) 칸에 마킹.
        const markCellOverride: NtsReportInstance["markCell"] | undefined = tp
          ? tp.timepoint === "양도시"
            ? "transfer"
            : isTransferAcq && Number(snap.acquisitionYear) < BUILDING_STD_FIRST_YEAR
              ? "acq2000"
              : "acq2001"
          : reconstructedTimepoint
            ? reconstructedTimepoint === "transfer"
              ? "transfer"
              // 재구성 취득 스냅샷의 연도는 `valuationYear`다(transfer 스냅샷의 acquisitionYear 아님).
              : Number(snap.valuationYear) < BUILDING_STD_FIRST_YEAR
                ? "acq2000"
                : "acq2001"
            : undefined;
        // 배치 스냅샷은 취득→최초→양도, 주택→상가 순으로 정렬. 비-배치는 삽입 순서 유지.
        // ⚠️ 정렬은 `tp.order`를 쓴다 — 라벨 문자열 매칭은 접두마다 달라(§164⑤ "최초공시일" ↔
        //    §164⑥ "최초고시(2005)") 새 접두가 붙을 때마다 조용히 0으로 떨어진다.
        const rank = tp ? tp.order * 2 + (tp.category === "commercial" ? 1 : 0) : 100 + seq;
        seq++;
        // 배치(tp)는 제목에 이미 주택분/상가분·시점이 있어 구분 라벨을 붙이면 중복된다.
        const kindLabel = tp ? undefined : (snapshotKindLabel(key) ?? undefined);
        out.push({ key, model, titleOverride, markCellOverride, kindLabel, rank });
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
      {reports.map(({ key, model, titleOverride, markCellOverride, kindLabel }) => (
        <NtsBuildingStdPriceReport key={key} model={model} titleOverride={titleOverride} markCellOverride={markCellOverride} kindLabel={kindLabel} />
      ))}
    </div>
  );
}
