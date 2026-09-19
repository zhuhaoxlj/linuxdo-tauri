#!/usr/bin/env python3
"""Alive 局域网握手协议验证 / 调试工具。

用法:
    lan_probe.py <ip> <port> [--token TOKEN]

不依赖任何第三方库，纯 stdlib 复刻手机端 LanCrypto 的算法，
用来在没构建 Tauri 的情况下验证：密钥派生、签名、鉴权、可达性。
"""
import argparse
import hashlib
import hmac
import json
import secrets
import sys
import time
import urllib.error
import urllib.request

PROTO = "alive-lan-v1"
SALT = b"alive-lan-v1"
INFO = b"alive-lan-ping"
PING_PATH = "/alive/ping"


def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    """与 Kotlin 端 LanCrypto.hkdfSha256 逐字节等价"""
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    okm, block, counter = b"", b"", 1
    while len(okm) < length:
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        okm += block
        counter += 1
    return okm[:length]


def ping_message(ts: int, nonce: str) -> str:
    return f"{PROTO}|GET|{PING_PATH}|{ts}|{nonce}"


def sign(key: bytes, message: str) -> str:
    return hmac.new(key, message.encode(), hashlib.sha256).hexdigest()


def probe(addr: str, port: int, key: bytes, ts: int = None, nonce: str = None,
          bad_sig: bool = False, timeout: float = 5.0):
    ts = int(time.time()) if ts is None else ts
    nonce = secrets.token_hex(8) if nonce is None else nonce
    sig = sign(key, ping_message(ts, nonce))
    if bad_sig:
        sig = "0" * len(sig)
    url = f"http://{addr}:{port}{PING_PATH}?ts={ts}&nonce={nonce}&sig={sig}"
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode()
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        status = e.code
    except Exception as e:
        return None, str(e), 0.0
    rtt_ms = (time.perf_counter() - started) * 1000
    return status, body, rtt_ms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ip")
    ap.add_argument("port", type=int)
    ap.add_argument("--token", required=True, help="中继 URL 里的 token")
    args = ap.parse_args()

    key = hkdf_sha256(args.token.encode(), SALT, INFO, 32)
    print(f"lanKey = {key.hex()}")

    status, body, rtt = probe(args.ip, args.port, key)
    if status is None:
        print(f"[FAIL] 连不上 {args.ip}:{args.port} -> {body}")
        sys.exit(1)
    print(f"[正常握手]   {status} {body}   rtt={rtt:.1f}ms")

    status, body, _ = probe(args.ip, args.port, key, bad_sig=True)
    print(f"[错误签名]   {status} {body}   (期望 401 bad_sig)")

    status, body, _ = probe(args.ip, args.port, key, ts=int(time.time()) - 600)
    print(f"[过期时间戳] {status} {body}   (期望 401 stale)")

    status, body, _ = probe(args.ip, args.port, b"\x00" * 32)
    print(f"[错误密钥]   {status} {body}   (期望 401 bad_sig)")

    ok = probe(args.ip, args.port, key)[0] == 200
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
