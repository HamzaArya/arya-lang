"""Independent Python verifier for PUBLIC Arya Secure vectors; needs cryptography for AES-GCM."""
import base64
import hashlib
import hmac
import json
from pathlib import Path


def decode(text):
    value = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    assert base64.urlsafe_b64encode(value).decode("ascii").rstrip("=") == text
    return value


def associated_data(key_id, context):
    result = b"arya$aes256gcm$v2$"
    for text in (key_id, context["account"], context["purpose"]):
        value = text.encode("utf-8")
        result += len(value).to_bytes(4, "big") + value
    return result


def verify():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    vectors = json.loads(Path(__file__).with_name("arya-secure-v1.json").read_text(encoding="utf-8"))
    for vector in vectors["passwords"]:
        key = hashlib.scrypt(vector["password"].encode("utf-8"), salt=decode(vector["salt"]),
                             n=vector["cost"], r=8, p=1, dklen=32,
                             maxmem=128 * vector["cost"] * 8 + 16 * 1024 * 1024)
        assert hmac.compare_digest(key, decode(vector["hash"].split("$")[-1]))
    for vector in vectors["encryption"]:
        fields = vector["encrypted"].split("$")
        nonce, tag, ciphertext = map(decode, fields[-3:])
        aad = associated_data(vector["keyId"], vector["context"]) if vector["version"] == "v2" else b""
        assert aad.hex() == vector["aadHex"]
        cipher = AESGCM(decode(vector["key"]))
        assert cipher.decrypt(nonce, ciphertext + tag, aad).decode("utf-8") == vector["plaintext"]
        assert cipher.encrypt(nonce, vector["plaintext"].encode("utf-8"), aad) == ciphertext + tag
    for vector in vectors["digests"]:
        assert hashlib.sha256(vector["text"].encode("utf-8")).hexdigest() == vector["sha256"]
    for vector in vectors["macs"]:
        assert hmac.new(decode(vector["key"]), vector["text"].encode("utf-8"), hashlib.sha256).hexdigest() == vector["hmacSha256"]
    print("Arya Secure vectors verified in Python: scrypt, AES-256-GCM v1/v2, SHA-256, HMAC-SHA-256.")


if __name__ == "__main__":
    verify()
