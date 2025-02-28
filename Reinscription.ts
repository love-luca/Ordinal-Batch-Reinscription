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
const receiveAddress: string = "tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc";

const metadata = {
  'type': 'lefrog',
  'description': 'Lefrogn reinscriptoin'
}

const metadataBuffer = cbor.encode(metadata);

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

const blockstream = new axios.Axios({
  baseURL: `${MEMPOOLAPI_URL}`,
});

export function createparentInscriptionTapScript(): Array<Buffer> {

  const keyPair = wallet.ecPair;
  const parentOrdinalStacks: any = [
    toXOnly(keyPair.publicKey),
    opcodes.OP_CHECKSIG,
    opcodes.OP_FALSE,
    opcodes.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    1,
    Buffer.concat([Buffer.from("text/plain;charset=utf-8", "utf8")]),
    1,
    5,
    metadataBuffer,
    opcodes.OP_0,
    Buffer.concat([Buffer.from("reinscription.bitmap", "utf8")]),
    opcodes.OP_ENDIF,
  ];
  return parentOrdinalStacks;
}

async function reInscribe() {
  const keyPair = wallet.ecPair;
  const parentOrdinalStack = createparentInscriptionTapScript();

  const ordinal_script = script.compile(parentOrdinalStack);

  const scriptTree: Taptree = {
    output: ordinal_script,
  };

  const redeem = {
    output: ordinal_script,
    redeemVersion: 192,
  };

  const ordinal_p2tr = payments.p2tr({
    internalPubkey: toXOnly(keyPair.publicKey),
    network,
    scriptTree,
    redeem,
  });

  const address = ordinal_p2tr.address ?? "";
  console.log("Sending coin to address", address);

  /**
   * calculate functoin for reinscirption fee
   *  */
  async function dummyReinscriptionPsbt(amount: number, targetAddress: string) {
    const utxos = [{
      txid: "d516c9d358eb0af6dcbe2ede3a48138e14db30df00d51e2cef216a34b70e1c69",
      vout: 1,
      value: 56662
    }]
    const psbt = new Psbt({ network })

    psbt.addInput({
      hash: utxos[0].txid,
      index: utxos[0].vout,
      tapInternalKey: toXOnly(keyPair.publicKey),
      witnessUtxo: { value: utxos[0].value, script: wallet.output! },
      tapLeafScript: [
        {
          leafVersion: redeem.redeemVersion,
          script: redeem.output,
          controlBlock: ordinal_p2tr.witness![ordinal_p2tr.witness!.length - 1],
        },
      ],
    });
    psbt.addOutput({
      address: receiveAddress,
      value: 546,
    });
    wallet.signPsbt(psbt, wallet.ecPair);
    const txVirtualSize = psbt.extractTransaction(true).virtualSize();
    return txVirtualSize
  }

  let virtualTempSize1 = 1000;

  const feerate1 = await getFeeRate()+100;
  const txVirtualSize1 = await dummyReinscriptionPsbt(virtualTempSize1 * feerate1, address)
  console.log("txVitualsize==>", txVirtualSize1);
  const reInscriptionFee = txVirtualSize1 * feerate1
  console.log('reInsccriptionFee==>', reInscriptionFee);

  /** 
   * calculate function for send inscription and btc fee
   *  */
  async function dummyPsbt(amount: number, targetAddress: string) {
    const OrdinalUtxos: Array<any> = [
      {
        txid: "46ff65310933258fdbade1304c79e85c0034281fd0e02deb230b5258289848af",
        vout: 0,
        value: 546
      },
      {
        txid: "042481b8c5dd9d018189d5b2e48ff97aba052b38a83894c16c2ebf8ce245ba9f",
        vout: 1,
        value: 13581197,
      }
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

    ordinalPsbt.addInput({
      hash: OrdinalUtxos[1].txid,
      index: OrdinalUtxos[1].vout,
      witnessUtxo: {
        value: OrdinalUtxos[1].value,
        script: wallet.output,
      },
      tapInternalKey: toXOnly(keyPair.publicKey),
    });

    ordinalPsbt.addOutput({
      address: address, //Destination Address
      value: 546 + reInscriptionFee,
    });
    wallet.signPsbt(ordinalPsbt, wallet.ecPair);
    const txVirtualSize = ordinalPsbt.extractTransaction(true).virtualSize();
    return txVirtualSize
  }

  let virtualTempSize = 1000;

  const feerate = await getFeeRate()+100;
  const txVirtualSize = await dummyPsbt(virtualTempSize * feerate, address)
  console.log("txVitualsize==>", txVirtualSize);
  const sendFee = txVirtualSize * feerate
  console.log('sendFee==>', sendFee);


  /**
   * Send inscription for reinscription and send btc
  */

  const btcUtxo = await reinscriptionUtxo()
  // console.log("btcutxo==>", btcUtxo);
  const filteredUtxoses = btcUtxo.filter((utxo: { satoshi: number }) => utxo.satoshi > (reInscriptionFee+sendFee))
  // console.log("filteredUtxos==>", filteredUtxoses);

  const OrdinalUtxos: Array<any> = [
    {
      txid: "ecf5369a724ec574c8c8be5eb917bf042696a69a216000052c1f58d85d2bdcd5",
      vout: 0,
      value: 546
    },
    {
      txid: "042481b8c5dd9d018189d5b2e48ff97aba052b38a83894c16c2ebf8ce245ba9f",
      vout: 1,
      value: 13581197,
    }
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

  ordinalPsbt.addInput({
    hash: OrdinalUtxos[1].txid,
    index: OrdinalUtxos[1].vout,
    witnessUtxo: {
      value: OrdinalUtxos[1].value,
      script: wallet.output,
    },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  ordinalPsbt.addOutput({
    address: address, //Destination Address
    value: 546 + reInscriptionFee,
  });
  ordinalPsbt.addOutput({
    address:receiveAddress,
    value:13581197-reInscriptionFee-sendFee,
  })

  const ordinalUtxo = await SendUtxoSignAndSend(keyPair, ordinalPsbt);
  await waitForConfirmation(ordinalUtxo)
  const utxos = await waitUntilUTXO(address as string)

  const psbt = new Psbt({ network });

  psbt.addInput({
    hash: utxos[0].txid,
    index: utxos[0].vout,
    tapInternalKey: toXOnly(keyPair.publicKey),
    witnessUtxo: { value: utxos[0].value, script: ordinal_p2tr.output! },
    tapLeafScript: [
      {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: ordinal_p2tr.witness![ordinal_p2tr.witness!.length - 1],
      },
    ],
  });

  psbt.addOutput({
    address: receiveAddress,
    value: 546,
  });

  await signAndSend(keyPair, psbt);
}

reInscribe()


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


export async function sendBTC(amount: number, targetAddress: string) {
  try {
    const tempUtxoList = [];
    const btcUtxo = await waitUntilUTXO(wallet.address)
    let btcTotalamount = 0;
    const psbt = new Psbt({ network });
    const feeRate = await getFeeRate() + 100;
    console.log("feeRate in sendBTC function", feeRate);

    psbt.addOutput({
      address: targetAddress,
      value: amount,
    })

    let fee = calculateTxFee(psbt, feeRate);

    for (const utxoInfo of btcUtxo) {
      if (utxoInfo.value > 1000 && btcTotalamount < fee + amount && !utxoList.includes(`${utxoInfo.txid}i${utxoInfo.vout}`)) {
        tempUtxoList.push(`${utxoInfo.txid}i${utxoInfo.vout}`);
        btcTotalamount += utxoInfo.value;
        psbt.addInput({
          hash: utxoInfo.txid,
          index: utxoInfo.vout,
          witnessUtxo: {
            value: utxoInfo.value,
            script: wallet.output,
          },
          tapInternalKey: Buffer.from(wallet.publicKey, "hex").slice(
            1,
            33
          ),
        });
      }
    }
    if (btcTotalamount < fee + amount)
      throw new Error("There is not enough BTC in this bidding utxo.");

    console.log("tempUtxoList ======> ", tempUtxoList);
    // utxoList.push(...tempUtxoList);
    if (btcTotalamount - amount - fee > 546) {
      psbt.addOutput({
        address: wallet.address,
        value: btcTotalamount - amount - fee,
      });
    }
    wallet.signPsbt(psbt, wallet.ecPair);
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    console.log("transfered btc successfuly");
    const txId = await broadcast(txHex);
    console.log("sendbtcid==>", txId);

    return txId;

  } catch (error) {
    throw new Error(error as string)
  }
}

export async function signAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  psbt.signInput(0, keypair);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction(true);
  const txid = await broadcast(tx.toHex());
  console.log('txid====>', txid);

  console.log(tx.virtualSize())
  console.log(tx.toHex())


}

export async function SendUtxoSignAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  const signer = tweakSigner(keypair, { network })
  psbt.setMaximumFeeRate(10000)
  psbt.signInput(0, signer);
  psbt.signInput(1, signer);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction(true);
  const txid = await broadcast(tx.toHex());
  console.log("txidtoaddress==>", txid);

  console.log("virtualsize==>", tx.virtualSize())
  console.log(tx.toHex())
  return txid
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


export async function reinscriptionUtxo() {

  const walletaddress = 'tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc'
  const response = await fetch(`https://open-api-testnet.unisat.io/v1/indexer/address/${walletaddress}/utxo-data`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.API_KEY as string}` },
  });
  const utxodata = await response.json() as any;
  // console.log("ustx===>", utxodata.data.utxo);
  return utxodata.data.utxo
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
