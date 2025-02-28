export const TEST_MODE = process.env.NETWORK == "testnet" ? true : false;

export const MEMPOOLAPI_URL = TEST_MODE
  ? "https://mempool.space/testnet/api"
  : "https://mempool.space/api";