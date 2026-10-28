import { afterEach, describe, expect, it, vi } from "vitest";
import { answerDocumentPayload, downloadAnswerExport } from "./answerExports";

afterEach(() => vi.unstubAllGlobals());
describe("answer exports", () => {
    it("retains typed table values, totals, citation pages and column order", () => {
        const payload = answerDocumentPayload({id:"a",role:"assistant",content:"###Summary",createdAt:"now",
            citations:[{documentId:"doc",name:"costs.xlsx",page:3,excerpt:"original"}],
            sqlArtifact:{generated_sql:"SELECT value",columns:["approved","value"],tables_used:[],row_count:57,
                preview_rows:[{value:0,approved:false}],source_file_id:"doc",source_file_name:"costs.xlsx"}});
        expect(payload.table_rows).toEqual([[false, 0]]);
        expect(payload.total_rows).toBe(57);
        expect(payload.citations[0].anchor).toBe("page_3");
    });
    it("sends authentication and active project without placing credentials in URLs", async () => {
        const fetcher = vi.fn().mockResolvedValue({ok:true,blob:async () => new Blob(["file"])});
        vi.stubGlobal("fetch", fetcher);
        await downloadAnswerExport("spreadsheet","private-token","project-a",{table_columns:["A"],table_rows:[[0]]});
        expect(fetcher.mock.calls[0][0]).toBe("/coair-api/chat/spreadsheet");
        expect(fetcher.mock.calls[0][1].headers).toMatchObject({Authorization:"Bearer private-token","X-Project-ID":"project-a"});
    });
    it("does not download error responses as successful documents", async () => {
        vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:403}));
        await expect(downloadAnswerExport("document","token","project-a",{})).rejects.toThrow("403");
    });
});
