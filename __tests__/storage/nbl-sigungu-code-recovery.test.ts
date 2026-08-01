/**
 * NBL 재촌 시·군·구 코드 복구 마이그레이션 (계획서 §6-C · Y-4).
 *
 * 실제 결함 사례를 그대로 고정한다 — 구 테이블은 서울에서 **도봉구부터 한 칸씩 밀려**
 * 있었다(D-3 실측). 그래서 사용자가 목록에서 「강남구」를 골라도 `11710`(현행 송파구)이
 * 저장됐다. 복구는 코드가 아니라 **함께 저장된 이름**으로 한다.
 */
import { describe, it, expect } from "vitest";
import {
  resolveCurrentSigunguCodeByName,
  recoverAssetSigunguCode,
} from "@/lib/storage/migrations/nbl-sigungu-code-recovery";
import { lookupSigungu } from "@/lib/korean-law/sigungu-codes";

describe("resolveCurrentSigunguCodeByName", () => {
  it("REC-1: 현행 이름은 그대로 현행 코드로 해석된다", () => {
    expect(resolveCurrentSigunguCodeByName("서울특별시 강남구")).toBe("11680");
    expect(resolveCurrentSigunguCodeByName("서울특별시 송파구")).toBe("11710");
    // 일반구가 있는 시는 전체명으로 저장된다
    expect(resolveCurrentSigunguCodeByName("경기도 수원시 장안구")).toBe("41111");
  });

  it("REC-2: 앞뒤 공백은 흡수한다", () => {
    expect(resolveCurrentSigunguCodeByName("  서울특별시 강남구 ")).toBe("11680");
  });

  it("REC-3: 시·도 개칭은 현행 표기로 다시 찾는다", () => {
    // 강원도 → 강원특별자치도
    const chuncheon = resolveCurrentSigunguCodeByName("강원도 춘천시");
    expect(chuncheon).not.toBeNull();
    expect(lookupSigungu(chuncheon!)?.fullName).toBe("강원특별자치도 춘천시");
    // 전라남도·광주광역시 → 전남광주통합특별시
    const wando = resolveCurrentSigunguCodeByName("전라남도 완도군");
    expect(wando).toBe("12850");
    const gwangsan = resolveCurrentSigunguCodeByName("광주광역시 광산구");
    expect(gwangsan).toBe("12330");
  });

  it("REC-4: 빈 값·미상 이름은 null (건드리지 않는다)", () => {
    expect(resolveCurrentSigunguCodeByName(undefined)).toBeNull();
    expect(resolveCurrentSigunguCodeByName("")).toBeNull();
    expect(resolveCurrentSigunguCodeByName("없는시 없는구")).toBeNull();
    // 폐지된 자치구(인천 재편 — N:M) 는 현행에 없어 복구 대상이 아니다
    expect(resolveCurrentSigunguCodeByName("인천광역시 중구")).toBeNull();
    // 일반구 신설(1:N) 도 하나로 정해지지 않는다
    expect(resolveCurrentSigunguCodeByName("경기도 부천시")).toBeNull();
  });
});

describe("recoverAssetSigunguCode", () => {
  it("REC-5: D-3 실사례 — 「강남구」로 저장된 구 코드 11710 → 현행 11680", () => {
    // 구 테이블에서 11710은 「강남구」였다(한 칸 밀림). 현행 11710은 송파구다.
    const asset = { nblLandSigunguCode: "11710", nblLandSigunguName: "서울특별시 강남구" };
    expect(recoverAssetSigunguCode(asset)).toBe(true);
    expect(asset.nblLandSigunguCode).toBe("11680");
  });

  it("REC-6: 이미 현행 코드면 손대지 않는다", () => {
    const asset = { nblLandSigunguCode: "11680", nblLandSigunguName: "서울특별시 강남구" };
    expect(recoverAssetSigunguCode(asset)).toBe(false);
    expect(asset.nblLandSigunguCode).toBe("11680");
  });

  it("REC-7: 이름 = 코드(5자리 직접 입력)는 건너뛴다 — 이름에 정보가 없다", () => {
    const asset = { nblLandSigunguCode: "11680", nblLandSigunguName: "11680" };
    expect(recoverAssetSigunguCode(asset)).toBe(false);
    expect(asset.nblLandSigunguCode).toBe("11680");
  });

  it("REC-8: 이름이 없으면 건너뛴다 — 코드만으로는 체계를 판별할 수 없다", () => {
    // `11680`은 구 체계(서초구)·현행(강남구) 양쪽에 존재한다. 추측 변환 금지.
    const asset = { nblLandSigunguCode: "11680" };
    expect(recoverAssetSigunguCode(asset)).toBe(false);
    expect(asset.nblLandSigunguCode).toBe("11680");
  });

  it("REC-9: 복구 불가 이름은 코드를 그대로 둔다 (폐지·분할)", () => {
    const asset = { nblLandSigunguCode: "28110", nblLandSigunguName: "인천광역시 중구" };
    expect(recoverAssetSigunguCode(asset)).toBe(false);
    expect(asset.nblLandSigunguCode).toBe("28110");
  });

  it("REC-10: 복구된 코드는 항상 현행 테이블에 실재한다", () => {
    // 잘못된 코드를 새로 심지 않는지 — 결과의 유효성까지 확인한다.
    for (const name of [
      "서울특별시 노원구",
      "부산광역시 해운대구",
      "강원도 강릉시",
      "전라남도 진도군",
      "경기도 성남시 분당구",
    ]) {
      const code = resolveCurrentSigunguCodeByName(name);
      expect(code, `${name} 해석 실패`).not.toBeNull();
      expect(lookupSigungu(code!), `${name} → ${code} 가 현행 테이블에 없다`).toBeDefined();
    }
  });
});
