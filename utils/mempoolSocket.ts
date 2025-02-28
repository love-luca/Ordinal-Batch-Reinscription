import axios from "axios";
import mempoolJS from "@mempool/mempool.js";
import { MEMPOOLAPI_URL } from "../config/config";

interface BlockMessage {
    block?: {
        txid: string; 
    };
}

export const getTxStatus = async (tx: string) => {
    try {
        const url = `${MEMPOOLAPI_URL}/tx/${tx}/status`;
        const res = await axios.get(url);
        
        return {
            confirmed: res.data.confirmed,
            blockHeight: res.data.block_height,
        };
    } catch (error) {
        console.error("Get TX Status Failed", error);
        return {
            confirmed: false,
            blockHeight: 0,
        };
    }
};

export const initMempoolSocket = async () => {
    try {
        const {
            bitcoin: { websocket },
        } = mempoolJS({
            hostname: "mempool.space",
            network: "testnet",
        });

        const ws = websocket.initServer({
            options: ["blocks"],
        });

        console.log("Mempool socket is running");

        ws.addEventListener("message", async (event: any) => {
            const res: BlockMessage = JSON.parse(event.data.toString());
            if (res.block) {
                const txId = res.block.txid;
                const txStatus = await getTxStatus(txId);
                if (txStatus.confirmed) {
                    console.log(`Transaction ${txId} is confirmed at block height ${txStatus.blockHeight}`);
                }
            }
        });
    } catch (error) {
        console.error("Mempool socket error:", error);
    }
};
