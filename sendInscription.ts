import {
  script,
  Psbt,
  initEccLib,
  networks,
  Signer as BTCSigner,
  crypto,
  payments,
  opcodes,
  address as Address,
  Transaction
} from "bitcoinjs-lib";

import { Taptree } from "bitcoinjs-lib/src/types";
import { ECPairFactory, ECPairAPI } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import networkConfig from "config/network.config";
import { WIFWallet } from 'utils/WIFWallet'
import cbor from 'cbor'
import { MEMPOOLAPI_URL } from "config/config";
import { getTxStatus } from "utils/mempoolSocket";
const network = networks.testnet;

initEccLib(ecc as any);
const ECPair: ECPairAPI = ECPairFactory(ecc);


const privateKey: string = process.env.PRIVATE_KEY as string;
const networkType: string = networkConfig.networkType;

const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });
const receiveAddress: string = "2N6bEzhvZk7ABGDYpX361PzTEZMRgi2ijAp";


const blockstream = new axios.Axios({
  baseURL: `${MEMPOOLAPI_URL}`,
});

interface IUTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}
const inscriptionId = "8881594c87160fa021792734a6738a46ae04f53810abe22604e8ba597f6f1fd3i0" //you get txid from client

async function sendInscription() {

  const keyPair = wallet.ecPair;

  /** 
   * calculate function for send inscription and btc fee
   *  */
  const fundtransactionId = "" // you can get this txid from client when user send fund

  async function dummyPsbtToSendInscription(amount: number, targetAddress: string) {
    const OrdinalUtxos: Array<any> = [
      {
        txid: "abe0069b68a24dd5d95b5ad090c69448144fff99ecc4ae5c5063aec141b19e5c",
        vout: 0,
        value: 546
      },
    ]
    const ordinalPsbt = new Psbt({ network })


    ordinalPsbt.addInput({
      hash: OrdinalUtxos[0].txid,
      index: OrdinalUtxos[0].vout,
      witnessUtxo: {
        value: OrdinalUtxos[0].value,
        script: wallet.output,
      },
      tapInternalKey: toXOnly(keyPair.publicKey),

    });

    ordinalPsbt.addOutput({
      address: receiveAddress, //Destination Address
      value: 546,
    });
    wallet.signPsbt(ordinalPsbt, wallet.ecPair);
    const txVirtualSize = ordinalPsbt.extractTransaction(true).virtualSize();
    return txVirtualSize
  }

  let virtualTempSize = 1000;

  const feerate = await getFeeRate() + 100;
  const txVirtualSize = await dummyPsbtToSendInscription(virtualTempSize * feerate, receiveAddress)
  console.log("txVitualsize==>", txVirtualSize);
  const sendInscriptionFee = txVirtualSize * feerate // you should send it to frontend so that users can send inscriptoin fee and you can add more fee for your profit 
  console.log('sendFee==>', sendInscriptionFee);


  /**
 * you need to wait for transaction confirmation
 */

  // await waitForConfirmation(inscriptionId) // wait for inscirption
  //  await waitForConfirmation(fundtransactionId)  // wait for fund
  const inscriptionUtxoinfo = await inscriptionUtxo()
  console.log("vout==>", inscriptionUtxoinfo);
  console.log(inscriptionUtxoinfo.vout);
  console.log(inscriptionUtxoinfo.satoshi);


  const btcUtxo = await fundUtxo()
  // console.log("btcutxo==>", btcUtxo);
  const filteredUtxoses = btcUtxo.filter((utxo: { satoshi: number }) => utxo.satoshi > sendInscriptionFee)

  const FundUtxo=[{
      txid: "2ad8008604ae0c857115763226caeb4bb59ed310eae02bdde632e822a8fb3adf",
      vout: 0,
      value: 287395
  },
]

  const psbt = new Psbt({ network })

  psbt.addInput({
    hash: FundUtxo[0].txid,
    index: FundUtxo[0].vout,
    witnessUtxo: {
      value: FundUtxo[0].value,
      script: wallet.output!,
    },
    tapInternalKey: Buffer.from(wallet.publicKey, "hex").slice(
      1,
      33
    ),
  });

  psbt.addInput({
    hash: inscriptionUtxoinfo.txid,
    index: inscriptionUtxoinfo.vout,
    witnessUtxo: {
      value: inscriptionUtxoinfo.satoshi,
      script: wallet.output!,
    },
    tapInternalKey: toXOnly(keyPair.publicKey),

  });

  psbt.addOutput({
    address: receiveAddress,
    value: 546,
  });

  psbt.addOutput({
    address: receiveAddress,
    value: FundUtxo[0].value-sendInscriptionFee,
  });

  await signAndSend(keyPair, psbt);
}

sendInscription()


export async function broadcast(txHex: string) {
  const response: AxiosResponse<string> = await blockstream.post("/tx", txHex);
  return response.data;
}
export const SIGNATURE_SIZE = 126;

export async function waitForConfirmation(txId: string) {
  let confirmed = false;
  while (!confirmed) {
    await new Promise(resolve => setTimeout(resolve, 10000));

    const status = await getTxStatus(txId);
    console.log(`Checking status for transaction ${txId}:`, status);

    if (status.confirmed) {
      console.log(`Transaction ${txId} confirmed at block height ${status.blockHeight}`);
      confirmed = true;
    }
  }
}

export async function getFeeRate() {
  const url = `${MEMPOOLAPI_URL}/v1/fees/recommended`;
  try {
    const response = await axios.get(url);
    const fees = response.data;

    console.log("feerate==>", fees.fastestFee);

    return fees.fastestFee
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

export const calculateTxFee = (psbt: Psbt, feeRate: number) => {
  const tx = new Transaction();

  for (let i = 0; i < psbt.txInputs.length; i++) {
    const txInput = psbt.txInputs[i];
    tx.addInput(txInput.hash, txInput.index, txInput.sequence);
    tx.setWitness(i, [Buffer.alloc(SIGNATURE_SIZE)]);
  }

  for (let txOutput of psbt.txOutputs) {
    tx.addOutput(txOutput.script, txOutput.value);
  }
  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);
  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);

  return tx.virtualSize() * feeRate;
};
const utxoList: string[] = []

export async function signAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  const signer = tweakSigner(keypair, { network })
  psbt.signInput(0, signer);
  psbt.signInput(1, signer);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction(true);
  const txid = await broadcast(tx.toHex());
  console.log('txid====>', txid);
  console.log(tx.virtualSize())
  console.log(tx.toHex())
}


export async function waitUntilUTXO(address: string) {
  return new Promise<IUTXO[]>((resolve, reject) => {
    let intervalId: any;
    const checkForUtxo = async () => {
      try {
        const response: AxiosResponse<string> = await blockstream.get(
          `/address/${address}/utxo`
        );
        const data: IUTXO[] = response.data
          ? JSON.parse(response.data)
          : undefined;
        console.log("wallet utxo", data);
        if (data.length > 0) {
          resolve(data);
          clearInterval(intervalId);
        }
      } catch (error) {
        reject(error);
        clearInterval(intervalId);
      }
    };
    intervalId = setInterval(checkForUtxo, 4000);
  });
}

export async function getTx(id: string): Promise<string> {
  const response: AxiosResponse<string> = await blockstream.get(
    `/tx/${id}/hex`
  );
  return response.data;
}

export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}
export function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}
export function tweakSigner(signer: any, opts: any = {}) {
  let privateKey = signer.privateKey;
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer!');
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }
  const tweakedPrivateKey = ecc.privateAdd(privateKey, tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash));
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!');
  }
  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

export async function inscriptionUtxo() {

  const response = await fetch(`https://open-api-testnet.unisat.io/v1/indexer/inscription/info/${inscriptionId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.API_KEY as string}` },
  });
  const utxodata = await response.json() as any;
  // console.log("ustx===>", utxodata.data.vout);


  if (utxodata.data && utxodata.data.utxo) {
    return utxodata.data.utxo  // Access vout correctly
  } else {
    throw new Error("vout is undefined; check the API response structure.");
  }
}

export async function fundUtxo() {

  const walletaddress = 'tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc'
  const response = await fetch(`https://open-api-testnet.unisat.io/v1/indexer/address/${walletaddress}/utxo-data`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.API_KEY as string}` },
  });
  const utxodata = await response.json() as any;
  // console.log("ustx===>", utxodata.data.utxo);
  return utxodata.data.utxo
}
