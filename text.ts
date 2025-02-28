import {
	Transaction,
	script,
	Psbt,
	initEccLib,
	networks,
	Signer as BTCSigner,
	crypto,
	payments,
	opcodes,
	address as Address,
} from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types';
import { ECPairFactory, ECPairAPI } from 'ecpair';
import ecc from '@bitcoinerlab/secp256k1';
import axios, { AxiosResponse } from 'axios';
import networkConfig from 'config/network.config';
import { WIFWallet } from 'utils/WIFWallet';
import cbor from 'cbor';

const network = networks.bitcoin;

initEccLib(ecc as any);
const ECPair: ECPairAPI = ECPairFactory(ecc);

const privateKey: string = process.env.PRIVATE_KEY as string;
const networkType: string = networkConfig.networkType;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const txhash: string = 'f0db0f66fe74595caaa3612792e0c958ee90533e274460368f2dcfc9a4473d3b';
const txidBuffer = Buffer.from(txhash, 'hex');
const inscriptionBuffer = txidBuffer.reverse();
const memeType: string = 'text/plain;charset=utf-8';
const pointer1: number = 546 * 1;
const pointerBuffer1: Buffer = Buffer.from(
	pointer1.toString(16).padStart(4, '0'),
	'hex'
).reverse();
const metaProtocol: Buffer = Buffer.concat([Buffer.from('bitmap', 'utf8')]);
const receiveAddress: string =
	'bc1pradnggdtvlrnhnjg20jw6uzt92mh9dmgjru33py7qze0ajyxk28sd7u4hz';
const metadata = {
	type: 'Test',
	description: 'Some more bitcoin pollution',
};
const metadataBuffer = cbor.encode(metadata);
const fee = 1100;

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
	return Buffer.from(content, 'utf8');
};

const contentBufferData: Buffer = contentBuffer(`
jellyfrog
    `);
const contentBufferArray: Array<Buffer> = splitBuffer(contentBufferData, 500);

export function createChildInscriptionTapScript(): Array<Buffer> {
	const keyPair = wallet.ecPair;

	let childOrdinalStacks: any = [
		toXOnly(keyPair.publicKey),
		opcodes.OP_CHECKSIG,
		opcodes.OP_FALSE,
		opcodes.OP_IF,
		Buffer.from('ord', 'utf8'),
		1,
		1,
		Buffer.concat([Buffer.from(memeType, 'utf8')]),
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
		opcodes.OP_0,
	];
	contentBufferArray.forEach((item: Buffer) => {
		childOrdinalStacks.push(item);
	});
	childOrdinalStacks.push(opcodes.OP_ENDIF);

	console.log(childOrdinalStacks);

	return childOrdinalStacks;
}

async function childInscribe() {
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

	const address = ordinal_p2tr.address ?? '';
	const requiredAmount = 546 + fee + 333;
	console.log(`Send ${requiredAmount} satoshis to address: ${address}`);

	const utxos = await waitUntilUTXO(address as string);

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

	const change = utxos[0].value - 546 - fee;
	console.log('change====+>', change);

	const psbt1 = psbt.addOutput({
		address: receiveAddress, //Destination Address
		value: 546,
	});
	console.log('receivepsbt1===>', JSON.stringify(psbt1));

	const psbt2 = psbt.addOutput({
		address: receiveAddress, // Change address
		value: change,
	});
	console.log('psbt2===>', JSON.stringify(psbt2));
	await signAndSend(keyPair, psbt);
}

childInscribe();

export async function signAndSend(keypair: BTCSigner, psbt: Psbt) {
	psbt.signInput(0, keypair);

	psbt.finalizeAllInputs();
	const tx = psbt.extractTransaction();
	console.log(tx.virtualSize());
	console.log(tx.toHex());

	const txid = await broadcast(tx.toHex());
	console.log(`Success! Txid is ${txid}`);
}

export async function waitUntilUTXO(address: string) {
	return new Promise<IUTXO[]>((resolve, reject) => {
		let intervalId: any;
		const checkForUtxo = async () => {
			try {
				const response: AxiosResponse<string> = await blockstream.get(
					`/address/${address}/utxo`
				);
				const data: IUTXO[] = response.data ? JSON.parse(response.data) : undefined;
				console.log(data);
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
	const response: AxiosResponse<string> = await blockstream.get(`/tx/${id}/hex`);
	return response.data;
}

const blockstream = new axios.Axios({
	// baseURL: `https://mempool.space/testnet/api`,
	baseURL: `https://mempool.space/api`,
});

export async function broadcast(txHex: string) {
	const response: AxiosResponse<string> = await blockstream.post('/tx', txHex);
	return response.data;
}

function toXOnly(pubkey: Buffer): Buffer {
	return pubkey.subarray(1, 33);
}
