import * as SecureStore from "expo-secure-store";

import { TOKEN_KEY } from "../src/constants";
import { clearToken, getToken, setToken } from "../src/lib/storage";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("secure token storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores legacy tokens in expo-secure-store", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("token_123");

    await setToken("token_123");
    const token = await getToken();
    await clearToken();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, "token_123");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(token).toBe("token_123");
  });
});
