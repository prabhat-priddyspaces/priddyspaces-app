import { parseAssistantSse } from "../src/lib/assistant";

describe("assistant client", () => {
  it("parses assistant SSE messages", () => {
    const parsed = parseAssistantSse(
      'event: message\ndata: {"enabled":true,"conversation_public_id":"conv_1","message":{"public_id":"msg_1","role":"assistant","content":"Hi","citations":[],"proposals":[]}}\n\n',
    );

    expect(parsed?.conversation_public_id).toBe("conv_1");
    expect(parsed?.message?.content).toBe("Hi");
  });
});
