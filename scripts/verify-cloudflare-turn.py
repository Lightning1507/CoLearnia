"""Probe TURN authentication without printing credentials or relay addresses."""

import argparse
import hashlib
import hmac
import json
import os
import secrets
import socket
import ssl
import struct
import sys
import time
import urllib.error
import urllib.request

MAGIC = 0x2112A442


def attribute(kind, value):
    return struct.pack("!HH", kind, len(value)) + value + b"\0" * (-len(value) % 4)


def message(kind, attributes, transaction, key=None):
    body = b"".join(attributes)
    header = struct.pack("!HHI", kind, len(body) + (24 if key else 0), MAGIC)
    header += transaction
    if key:
        body += attribute(8, hmac.new(key, header + body, hashlib.sha1).digest())
    return header + body


def read_exact(connection, length):
    result = b""
    while len(result) < length:
        chunk = connection.recv(length - len(result))
        if not chunk:
            raise ValueError("TURN connection closed")
        result += chunk
    return result


def response(connection, transaction):
    header = read_exact(connection, 20)
    kind, length, magic = struct.unpack("!HHI", header[:8])
    if magic != MAGIC or header[8:] != transaction or length % 4:
        raise ValueError("Invalid TURN response")
    body = read_exact(connection, length)
    attributes = {}
    offset = 0
    while offset < len(body):
        if offset + 4 > len(body):
            raise ValueError("Truncated TURN attribute")
        key, size = struct.unpack("!HH", body[offset:offset + 4])
        end = offset + 4 + size
        if end > len(body):
            raise ValueError("Truncated TURN attribute")
        attributes[key] = body[offset + 4:end]
        offset = end + (-size % 4)
    return kind, attributes


def allocate(credentials):
    # A new TLS connection for every probe avoids reusing an existing allocation.
    with socket.create_connection(("turn.cloudflare.com", 443), timeout=15) as raw:
        with ssl.create_default_context().wrap_socket(
            raw, server_hostname="turn.cloudflare.com"
        ) as connection:
            transaction = os.urandom(12)
            request = [attribute(0x19, b"\x11\0\0\0")]
            connection.sendall(message(3, request, transaction))
            kind, challenge = response(connection, transaction)
            error = challenge.get(9, b"")
            if kind != 0x113 or len(error) < 4 or error[2:4] != b"\4\1":
                raise ValueError("Expected TURN authentication challenge")
            realm, nonce = challenge[0x14], challenge[0x15]
            username = credentials["username"].encode()
            # MD5 and HMAC-SHA1 are required by TURN long-term authentication.
            key = hashlib.md5(
                username + b":" + realm + b":" + credentials["credential"].encode()
            ).digest()
            auth = [attribute(6, username), attribute(0x14, realm), attribute(0x15, nonce)]
            transaction = os.urandom(12)
            connection.sendall(message(3, request + auth, transaction, key))
            kind, result = response(connection, transaction)
            if kind == 0x103 and len(result.get(0x16, b"")) >= 8:
                family = result[0x16][1]
                transaction = os.urandom(12)
                connection.sendall(message(
                    4, [attribute(0x0D, struct.pack("!I", 0))] + auth, transaction, key
                ))
                response(connection, transaction)
                return {"accepted": True, "relayFamily": family, "protocol": "tls", "port": 443}
            error = result.get(9, b"")
            if kind != 0x113 or len(error) < 4:
                raise ValueError("Unexpected TURN allocation response")
            return {"accepted": False, "turnCode": error[2] * 100 + error[3]}


def emit(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


def verify(args):
    key_id = os.environ["TURN_KEY_ID"]
    api_token = os.environ["TURN_KEY_API_TOKEN"]
    base = "https://rtc.live.cloudflare.com/v1/turn/keys/" + key_id + "/credentials"
    issued = []

    def api(path, body=None):
        request = urllib.request.Request(
            base + path,
            data=json.dumps(body).encode() if body is not None else b"",
            headers={"Authorization": "Bearer " + api_token,
                     "Content-Type": "application/json", "User-Agent": "CoLearnia-TURN-Probe/1.0"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as result:
            data = result.read()
            return result.status, json.loads(data) if data else None

    def generate():
        status, data = api("/generate-ice-servers", {"ttl": args.ttl})
        if status != 201:
            raise ValueError("Unexpected credential API status")
        credentials = next(item for item in data["iceServers"] if item.get("username"))
        issued.append(credentials)
        return credentials

    try:
        used, unused = generate(), generate()
        started = time.monotonic()
        valid = allocate(used)
        wrong = allocate({**used, "credential": secrets.token_urlsafe(32)})
        emit("baseline", ttl=args.ttl, valid=valid, wrongPassword=wrong)
        if not valid["accepted"] or wrong["accepted"]:
            return 1
        for age in [args.ttl + 20, args.ttl + args.delay]:
            time.sleep(max(0, age - (time.monotonic() - started)))
            used_result, unused_result = allocate(used), allocate(unused)
            emit("expiry", ageSeconds=round(time.monotonic() - started),
                 previouslyUsed=used_result, previouslyUnused=unused_result)
        fresh = allocate(generate())
        emit("fresh-control", result=fresh)
        # A transport failure must not be counted as an expired credential rejection.
        return int(used_result["accepted"] or unused_result["accepted"] or not fresh["accepted"])
    finally:
        for credentials in issued:
            try:
                status, _ = api("/" + credentials["username"] + "/revoke")
                emit("revoke", status=status)
            except urllib.error.HTTPError as error:
                emit("revoke", status=error.code)
            except (urllib.error.URLError, OSError) as error:
                emit("revoke-error", errorType=type(error).__name__)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allocate-stdin", action="store_true", help="Read temporary credentials from stdin; do not call the API")
    parser.add_argument("--ttl", type=int, default=60)
    parser.add_argument("--delay", type=int, default=840, help="Seconds after TTL for the final probe")
    args = parser.parse_args()
    if not 1 <= args.ttl <= 172800 or not 21 <= args.delay <= 3600:
        parser.error("ttl must be 1..172800 and delay must be 21..3600")
    try:
        if args.allocate_stdin:
            emit("allocate", result=allocate(json.load(sys.stdin)))
            return 0
        return verify(args)
    except (Exception, KeyboardInterrupt) as error:
        # Exception messages, URLs and bodies can contain credentials. Print only the type.
        emit("probe-error", errorType=type(error).__name__,
             httpStatus=error.code if isinstance(error, urllib.error.HTTPError) else None)
        return 1


if __name__ == "__main__":
    sys.exit(main())
