import {
  Transaction,
  script,
  Psbt,
  initEccLib,
  networks,
  Signer as BTCSigner,
  payments,
  opcodes,
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";
import { ECPairFactory, ECPairAPI } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import networkConfig from "config/network.config";
import { WIFWallet } from 'utils/WIFWallet'
import cbor from 'cbor';
import { getTxStatus, initMempoolSocket } from "utils/mempoolSocket";
import { MEMPOOLAPI_URL } from "config/config";

const network = networks.testnet;;

initEccLib(ecc as any);
const ECPair: ECPairAPI = ECPairFactory(ecc);

const privateKey: string = process.env.PRIVATE_KEY as string;
const networkType: string = networkConfig.networkType;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });
export const SIGNATURE_SIZE = 126;

const txhash: string = 'd9b95d549219eebcd1be0360f41c7164c4ad040b716475630154f08263ab2fdf';
const txidBuffer = Buffer.from(txhash, 'hex');
const inscriptionBuffer = txidBuffer.reverse();
const memeType: string = 'text/html;charset=utf-8';
const pointer1: number = 546 * 1;
const pointerBuffer1: Buffer = Buffer.from(pointer1.toString(16).padStart(4, '0'), 'hex').reverse();
const metaProtocol: Buffer = Buffer.concat([Buffer.from("parcel.bitmap", "utf8")]);
const receiveAddress: string = 'tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc';

const metadata = {
  'type': 'Bitmap',
  'description': 'Bitmap Community Parent Ordinal'
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

const splitBuffer = (buffer: Buffer, chunkSize: number) => {
  let chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
};

export const contentBuffer = (content: string) => {
  return Buffer.from(content, 'utf8')
}

const contentBufferData: Buffer = contentBuffer(`
<!DOCTYPE html>
<html lang="en"> 
<body style="margin:0; padding:0">
    <canvas id="canvas" style="width:100%; height:auto;" width="2500" height="2500"></canvas>
<script>
       function draw(t,e){
	let n=t.getContext("2d"),
	o=[];
	var a=0;
	e.forEach(t=>{
	let l=new Image;
	l.src=t,l.onload=()=>{
		(a+=1)===e.length&&function t(){
			for(let e=0;e<o.length;e++)n.drawImage(o[e],0,0,2500,2500)}()},o.push(l)})}
 draw(document.getElementById('canvas'), [
            "/content/7cc1561d65c7986d8350af3fd00c29e63628034c220a8c572615c2672cfc5d5ei0",
            "/content/feb371e5b315cdbbfdfb262ae70c3b8409e2fdd39aeb7b3c44f98edbf109d959i0",
            "/content/a86c9b7da5080c0b64a1c9f583d89f30bfcf91b246865b82668c896de6edc4d2i0",
            "/content/df5252f52d13eb6f3ff5d76854343415efe6090924bbac47901038fe4ce1f9e3i0"
        ]);
    </script>
</body>
</html>
    `)

const contentBufferArray: Array<Buffer> = splitBuffer(contentBufferData, 500)

export function createChildInscriptionTapScript(): Array<Buffer> {

  const keyPair = wallet.ecPair;

  let childOrdinalStacks: any = [
    toXOnly(keyPair.publicKey),
    opcodes.OP_CHECKSIG,
    opcodes.OP_FALSE,
    opcodes.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    1,
    Buffer.concat([Buffer.from(memeType, "utf8")]),
    1,
    2,
    pointerBuffer1,
    1,
    3,
    inscriptionBuffer,
    1,
    5,
    metadataBuffer,
    1,
    7,
    metaProtocol,
    opcodes.OP_0
  ];
  contentBufferArray.forEach((item: Buffer) => {
    childOrdinalStacks.push(item)
  })
  childOrdinalStacks.push(opcodes.OP_ENDIF)

  console.log(childOrdinalStacks)

  return childOrdinalStacks;
}

async function childInscribe() {

  await initMempoolSocket();
  const keyPair = wallet.ecPair;
  const childOrdinalStack = createChildInscriptionTapScript();

  const ordinal_script = script.compile(childOrdinalStack);

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
  console.log("send coin to address", address);

  if (address === "") {
    console.log("Can Not Get Inscription Address");
    return {
      success: false,
      message: "Can Not Get Inscription Address",
      payload: null
    }
  }

  async function dummyPsbtToInscribe(amonut: number, address: string) {

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
      address: receiveAddress, //Destination Address
      value: 546,
    });

    wallet.signPsbt(psbt, wallet.ecPair);
    const txVirtualSize = psbt.extractTransaction(true).virtualSize();
    return txVirtualSize

  }

  let virtualTempSize = 1000;

  const feerate = await getFeeRate() + 2000;
  console.log("feerate===>", feerate);

  const txVirtualSizeOfInscription = await dummyPsbtToInscribe(virtualTempSize * feerate, address)
  console.log("txVirtualSizeOfInscription==>", txVirtualSizeOfInscription);

  const inscriptionFee = txVirtualSizeOfInscription * feerate
  console.log('inscriptionFee==>', inscriptionFee);

  /**
   * 
   * @param amount 
   * @param targetAddress 
   * @returns 
   */
  async function dummyPsbtToSendBtc(amount: number, targetAddress: string) {
    const tempUtxoList = [];
    let btcTotalamount = 0;
    const psbt = new Psbt({ network });
    const feeRate = await getFeeRate();
    psbt.addOutput({
      address: targetAddress,
      value: amount,
    })

    let fee = calculateTxFee(psbt, feeRate);
    const btcUtxo = await waitUntilUTXO(wallet.address)
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
    const txVirtualSize = psbt.extractTransaction(true).virtualSize();
    return txVirtualSize
  }

  let virtualTempSize1 = 1000;

  const feerate1 = await getFeeRate() + 2000;
  const txVirtualSizeOfBtc = await dummyPsbtToSendBtc(virtualTempSize1 * feerate1, address)
  const sendFee = txVirtualSizeOfBtc * feerate1
  console.log('txVirtualSizeOfBtc===>', txVirtualSizeOfBtc);
  console.log("sendBtcFee===>", sendFee);



  const amountToSendBTC = await sendBTC(inscriptionFee + sendFee + 546, address)
  console.log("amountToSendBTC===>", amountToSendBTC);

  await waitForConfirmation(amountToSendBTC)


  const psbt = new Psbt({ network });

  const utxos = await waitUntilUTXO(address as string);

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
    address: receiveAddress, //Destination Address
    value: 546,
  });

  await signAndSend(keyPair, psbt);

}

childInscribe()

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

export async function signAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {

  psbt.signInput(0, keypair);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction();
  const txVirtualSize = tx.virtualSize()
  console.log("transaction virtual size", txVirtualSize)
  console.log("transaction Hex", tx.toHex());
  const txid = await broadcast(tx.toHex());
  // console.log(`Success! Txid is ${txid}`);
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
        console.log("utxo==>", data);
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

const blockstream = new axios.Axios({
  baseURL: `https://mempool.space/testnet/api`,
  // baseURL: `https://mempool.space/api`,
});

export async function broadcast(txHex: string) {
  const response: AxiosResponse<string> = await blockstream.post("/tx", txHex);
  return response.data;
}

export function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}

