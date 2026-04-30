from web3 import Web3
import hashlib
import os
from dotenv import load_dotenv

load_dotenv()

RPC_URL = (os.getenv("RPC_URL") or "").strip()
PRIVATE_KEY = (os.getenv("PRIVATE_KEY") or "").strip()
WALLET_ADDRESS = (os.getenv("WALLET_ADDRESS") or "").strip()

w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10})) if RPC_URL else Web3()

# 🔐 Generate hash
def generate_hash(data):
    return hashlib.sha256(str(data).encode()).hexdigest()


# 🚀 Store hash on blockchain (Polygon Amoy)
def store_on_blockchain(data_hash):
    try:
        if not RPC_URL or not PRIVATE_KEY or not WALLET_ADDRESS:
            print("❌ Blockchain Error: missing RPC_URL/PRIVATE_KEY/WALLET_ADDRESS")
            return "failed"
        if not w3.is_connected():
            raise Exception("❌ Blockchain not connected")

        nonce = w3.eth.get_transaction_count(WALLET_ADDRESS)

        tx = {
            "nonce": nonce,
            "to": WALLET_ADDRESS,
            "value": 0,
            "gas": 200000,
            "gasPrice": w3.to_wei("30", "gwei"),
            "data": w3.to_hex(text=data_hash),
            "chainId": 80002
        }

        signed_tx = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)

        # ✅ Compatible for all versions
        tx_hash = w3.eth.send_raw_transaction(
            getattr(signed_tx, "rawTransaction", signed_tx.raw_transaction)
        )

        return tx_hash.hex()

    except Exception as e:
        print("❌ Blockchain Error:", e)
        return "failed"