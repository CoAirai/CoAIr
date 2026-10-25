import { describe, expect, it, vi } from "vitest";
import { createForensicRun, defaultForensicRunParameters } from "./forensic";
import { coairFetch } from "./client";
vi.mock("./client", () => ({ COAIR_API_BASE:"/coair-api", CoairApiError:Error, coairFetch:vi.fn().mockResolvedValue({}) }));
describe("native toolkit requests", () => {
    it("keeps deterministic analysis as default and permits explicit AI narrative", async () => {
        await createForensicRun("token","project-a","workspace","dcma");
        expect(vi.mocked(coairFetch).mock.calls.at(-1)?.[1]).toMatchObject({projectId:"project-a",body:{ai_narrative:false,parameters:{kind:"dcma"}}});
        await createForensicRun("token","project-a","workspace","dcma",undefined,true);
        expect(vi.mocked(coairFetch).mock.calls.at(-1)?.[1]).toMatchObject({body:{ai_narrative:true}});
    });
    it("uses the native Word assembler and still rejects incomplete delay inputs", () => {
        expect(defaultForensicRunParameters("report-assembler")).toEqual({kind:"report-assembler"});
        expect(defaultForensicRunParameters("time-impact-analysis")).toBeNull();
    });
});
