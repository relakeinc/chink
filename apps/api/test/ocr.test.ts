import { beforeEach, describe, expect, test, vi } from "vitest";

const { runGeminiPrompt } = vi.hoisted(() => ({ runGeminiPrompt: vi.fn() }));
vi.mock("../src/lib/gemini.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/gemini.js")>();
  return { ...original, runGeminiPrompt };
});

import { extraerComprobante } from "../src/lib/bancos.js";

describe("lectura de comprobantes", () => {
  beforeEach(() => runGeminiPrompt.mockReset());

  test("reintenta con Flash si la primera lectura no trae monto ni referencia", async () => {
    runGeminiPrompt
      .mockResolvedValueOnce("{}")
      .mockResolvedValueOnce(JSON.stringify({
        monto_raw_text: "$ 54.000", referencia: "M30427509", fecha: "2026-10-17", banco_destino: "Nequi",
      }));

    const result = await extraerComprobante("imagen", "image/jpeg", { banco: "Nequi", confianza: 0.95, evidencias: [] });
    expect(result.monto).toBe(54000);
    expect(result.referencia).toBe("M30427509");
    expect(runGeminiPrompt).toHaveBeenCalledTimes(2);
    expect(runGeminiPrompt.mock.calls[1]?.[3]).toMatchObject({ json: true, models: ["gemini-2.5-flash"] });
  });
});
