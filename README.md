# Ordinal Batch Inscription & Reinscription 🚀

## Overview
This repository provides a **batch inscription** and **reinscription** tool for **Bitcoin Ordinals**, allowing users to efficiently inscribe multiple assets in a single transaction and reinscribe data on existing ordinals. 

## Features 🔥
- ✅ **Batch Inscription** – Mint multiple Ordinals efficiently in a single transaction.
- ✅ **Reinscription Support** – Modify and reinscribe data on existing Ordinals.
- ✅ **Flexible Output Modes** – Supports `same-sat`, `satpoints`, `separate-outputs`, and `shared-output`.
- ✅ **Optimized for Fees** – Reduce gas costs with bulk inscriptions.
- ✅ **Simple YAML Configuration** – Easily customize inscriptions with `batch.yaml`.

## Installation 📥
```bash
# Clone the repository
git clone https://github.com/love-luca/ordinal-batch-inscription.git
cd ordinal-batch-inscription

# Install dependencies
npm install # or yarn install
```

## Usage ⚡
### 1️⃣ Prepare the Configuration
Edit the `batch.yaml` file to define the batch inscription settings:
```yaml
batch:
  mode: "separate-outputs"  # Options: same-sat, satpoints, separate-outputs, shared-output
  postage: 546  # Minimum required satoshis for each inscription
  inscriptions:
    - content: "image1.png"
      type: "image/png"
    - content: "metadata.json"
      type: "application/json"
```

### 2️⃣ Run the Batch Inscription
```bash
npm run inscribe
```

### 3️⃣ Reinscribe Existing Ordinals
To reinscribe on an existing satoshi:
```bash
npm run reinscribe --ordinal-id=<ordinal_id> --content=new-data.txt
```

## Example Use Cases 🛠️
- **NFT Collections** – Inscribe multiple NFTs in one go.
- **On-Chain Content Updates** – Modify Ordinals dynamically.
- **Tokenized Assets** – Efficient inscription of financial assets.

## Contributing 🤝
We welcome contributions! Feel free to **fork this repo, submit pull requests, or report issues**.


## Stay Connected 🌎
- Twitter: [@defai_maxi](https://twitter.com/defai_maxi)
- Telegram: [@rhettjel](https://t.me/rhettjel)

---

_This project is designed to empower creators and developers by making Bitcoin Ordinal inscriptions and reinscriptions more efficient and cost-effective._ 🚀🔥
