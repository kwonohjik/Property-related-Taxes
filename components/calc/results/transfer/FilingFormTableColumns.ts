/**
 * 신고서 양식 표 **열 구성 판정** — `FilingFormTableHelpers.ts`에서 분리 (800줄 정책).
 *
 * 어떤 열을 그릴지는 결과의 구조(다자산 합산 · 재개발 분기 · 겸용 4분할 · 토지/건물 2분할)가
 * 정한다. 행 값 채우기(`buildRows`)와는 관심사가 달라 이 파일이 자연스러운 이음매다.
 *
 * 열 키(`ColumnKey`)·모드(`ColumnMode`) 타입은 종전 위치를 유지한다 — 이 파일과 Helpers 양쪽이
 * 쓰고, 기존 import 경로를 깨지 않기 위해서다(memory `feedback_800line_split_export_preservation`).
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { AggregateMeta, Column, ColumnMode } from "./FilingFormTableHelpers";

export function deriveColumns(
  result: TransferTaxResult,
  aggregate?: AggregateMeta,
  redevSubject?: "right" | "apt",
  redevSettlementDirection?: "pay" | "receive",
): {
  columns: Column[];
  mode: ColumnMode;
} {
  // 다자산 합산 모드 우선 — 사례 27 등 묶음·합산 신고
  if (aggregate && aggregate.properties.length > 0) {
    const aggCols: Column[] = [{ key: "total", label: "합계" }];
    for (const p of aggregate.properties) {
      const own = aggregate.ownershipMap?.get(p.propertyId);
      const nature = aggregate.landNatureMap?.get(p.propertyId);
      let label = p.propertyLabel;
      // 지분 배지
      if (own && own.numerator > 0 && own.denominator > 0 && own.numerator < own.denominator) {
        const pct = ((own.numerator / own.denominator) * 100)
          .toFixed(2)
          .replace(/\.?0+$/, "");
        label = `${label} (지분 ${pct}%)`;
      }
      // 토지 성격 suffix — 부수토지/독립 나대지 (사례 28 landNature 명시 입력 정책)
      if (nature === "appurtenant") {
        label = `${label} (부수토지)`;
      } else if (nature === "standalone") {
        label = `${label} (독립 나대지)`;
      }
      aggCols.push({ key: p.propertyId, label });
    }
    return { mode: "aggregate", columns: aggCols };
  }

  // 재개발/재건축 — aggregate와 mutually exclusive
  if (result.redevelopmentDetail) {
    // 사례 37 — 토지 출자 §166③: landContribDetail 존재 시 3열 (합계/인가전/인가후)
    // land 분기는 right+pay에서만 허용 (validate가 차단). 최우선 분기.
    if (result.redevelopmentDetail.landContribDetail) {
      return {
        mode: "redev-right-land-pay",
        columns: [
          { key: "total", label: "합계" },
          { key: "preApproval", label: "① 인가전 분 (취득일~인가일)" },
          { key: "postApprovalExistingHouse", label: "② 인가후 분 (LTHD 제외)" },
        ],
      };
    }
    // subject="right" + pay → 3열 (합계/인가전/인가후)
    // §95② 본문 괄호: 인가후(청산금납부분) LTHD 배제 — 별도 열로 명시
    if (redevSubject === "right" && redevSettlementDirection === "pay") {
      return {
        mode: "redev-right-pay",
        columns: [
          { key: "total", label: "합계" },
          { key: "preApproval", label: "① 인가전 분" },
          { key: "postApproval", label: "② 인가후 분 (청산금 납부)" },
        ],
      };
    }
    // subject="right" + receive → 3열 (합계/인가전 분(나목)/인가후 분(가목))
    // §166①2호 나목(인가전 분)·가목(인가후 분) 분리 표시
    // 가목(인가후 분) LTHD = 0 (§95② 본문 괄호·zeroBranch)
    // ★ 사례 38·39 라벨 정합화: "입주권 분/청산금 분" → "인가전 분(나목)/인가후 분(가목)"
    if (redevSubject === "right" && redevSettlementDirection === "receive") {
      return {
        mode: "redev-right-receive",
        columns: [
          { key: "total", label: "합계" },
          { key: "preApproval", label: "① 인가전 분 (나목)" },
          { key: "settlement", label: "② 인가후 분 (가목)" },
        ],
      };
    }
    // 그 외(apt): 4열
    // apt + receive + settlementExemptionApplied=true → 청산금 열 라벨에 비과세 차감 명시
    const settlementLabel =
      redevSettlementDirection === "receive" &&
      result.redevelopmentDetail?.settlementExemptionApplied === true
        ? "③ 청산금 분 (§89①4호 비과세 차감 후)"
        : "③ 청산금 분";
    return {
      mode: "redev-4split",
      columns: [
        { key: "total", label: "합계" },
        { key: "preApproval", label: "① 인가전 분" },
        { key: "postApprovalExistingHouse", label: "② 인가후 기존건물분" },
        { key: "settlement", label: settlementLabel },
      ],
    };
  }

  const mu = result.mixedUseDetail;
  const sp = result.splitDetail;

  if (mu && mu.partialUsageChange?.phdScopeBranch === "case_a_whole_building") {
    return {
      mode: "fourpart",
      columns: [
        { key: "total", label: "합계" },
        { key: "housingLand", label: "토지(주택분)" },
        { key: "housingBuilding", label: "주택" },
        { key: "commercialLand", label: "토지(기타분)" },
        { key: "commercialBuilding", label: "기타건물" },
      ],
    };
  }
  if (mu) {
    // 일반 겸용주택 — 주택분·상가분을 각각 토지/건물로 4분할 (토지-우선).
    // 컬럼 키는 Case A "fourpart"와 동일 재사용 → fourPartFinancials 채움 로직 공유.
    return {
      mode: "mixed-4col",
      columns: [
        { key: "total", label: "합계" },
        { key: "housingLand", label: "주택분 토지" },
        { key: "housingBuilding", label: "주택분 건물" },
        { key: "commercialLand", label: "상가분 토지" },
        { key: "commercialBuilding", label: "상가분 건물" },
      ],
    };
  }
  if (sp) {
    // 토지·건물 소유자 분리 — 본인이 소유하지 않는 파트 컬럼 제거 (소령 §166⑥, §168②).
    // building_only → 토지 컬럼 없음 / land_only → 건물 컬럼 없음.
    const selfOwns = sp.selfOwns ?? "both";
    const columns: Column[] = [{ key: "total", label: "합계" }];
    if (selfOwns !== "building_only") columns.push({ key: "land", label: "토지" });
    if (selfOwns !== "land_only") columns.push({ key: "building", label: "건물" });
    return { mode: "split-2col", columns };
  }
  return {
    mode: "single",
    columns: [{ key: "total", label: "합계" }],
  };
}
