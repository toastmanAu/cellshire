#!/usr/bin/env python3
"""Probe Cellshire Bank backend HTTP contracts before browser testnet smoke.

The probe reads the same deployment values manifest used by the production
smoke preflight and checks:

  - BORROW input provider response envelope
  - REPAY input provider response envelope
  - reserve signer response envelope or explicit rejection

It is safe to run against the local fixture. Against production, the reserve
signer may reject the synthetic tx; that still proves the endpoint is reachable
and speaks the expected JSON rejection shape unless --require-signer-success is
set.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BANK_INPUT_PROVIDER_RESPONSE_PROTOCOL = "cellshire.bank.inputs.response"
BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL = "cellshire.bank.reserve-sign.response"
DEFAULT_WALLET_ADDRESS = "ckt1cellshirebackendprobe000000000000000000000000000"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        values = load_json(args.deployment_values_json)
        report = run_probe(values, timeout=args.timeout, require_signer_success=args.require_signer_success)
    except (OSError, ValueError) as err:
        print(f"bank backend readiness probe failed: {err}", file=sys.stderr)
        return 2

    encoded = json.dumps(report, indent=2, sort_keys=True)
    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.write("\n")
    else:
        print(encoded)
    return 0 if report["ok"] else 2


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deployment-values-json", required=True)
    parser.add_argument("--output-json", default="")
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument(
        "--require-signer-success",
        action="store_true",
        help="Fail when reserve signer returns ok:false instead of accepting it as a reachable rejection.",
    )
    return parser.parse_args(argv)


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        loaded = json.load(handle)
    if not isinstance(loaded, dict):
        raise ValueError("deployment values must be a JSON object")
    return loaded


def run_probe(values: dict[str, Any], *, timeout: float, require_signer_success: bool) -> dict[str, Any]:
    backend = values.get("backend") if isinstance(values.get("backend"), dict) else {}
    funding = values.get("funding") if isinstance(values.get("funding"), dict) else {}
    input_url = text(backend.get("inputProviderUrl"))
    borrow_url = text(backend.get("borrowInputProviderUrl")) or input_url
    repay_url = text(backend.get("repayInputProviderUrl")) or input_url
    signer_url = text(backend.get("reserveSignerUrl"))
    token = text(backend.get("token"))
    reserve_cells = list_of_dicts(funding.get("bankReserveCells") or funding.get("reserveCells"))

    checks = {
        "borrowInputProvider": missing_url("borrow input provider") if not borrow_url else probe_borrow(borrow_url, token, timeout),
        "repayInputProvider": missing_url("repay input provider") if not repay_url else probe_repay(repay_url, token, timeout),
        "reserveSigner": missing_url("reserve signer") if not signer_url else probe_signer(signer_url, token, reserve_cells, timeout),
    }
    signer_ok = checks["reserveSigner"]["ok"] or (
        not require_signer_success and checks["reserveSigner"]["status"] == "reachable-rejected"
    )
    ok = checks["borrowInputProvider"]["ok"] and checks["repayInputProvider"]["ok"] and signer_ok
    return {
        "protocol": "cellshire.bank.backend-readiness.report",
        "version": 1,
        "createdAtUnix": int(time.time()),
        "ok": ok,
        "checks": checks,
    }


def probe_borrow(url: str, token: str, timeout: float) -> dict[str, Any]:
    body = {
        "protocol": "cellshire.bank.inputs.select",
        "version": 1,
        "action": "borrow",
        "walletAccount": {
            "provider": "probe",
            "address": DEFAULT_WALLET_ADDRESS,
            "network": "testnet",
        },
        "offer": {
            "id": "starter-float",
            "amount": 7500,
            "currency": "ckb",
            "totalOwed": 7687.5,
            "feeAmount": 187.5,
        },
        "collateralAmount": 11250,
    }
    return validate_input_response(post_json(url, body, token, timeout), "borrow", ("bankReserveCell", "collateralCell"))


def probe_repay(url: str, token: str, timeout: float) -> dict[str, Any]:
    body = {
        "protocol": "cellshire.bank.inputs.select",
        "version": 1,
        "action": "repay",
        "walletAccount": {
            "provider": "probe",
            "address": DEFAULT_WALLET_ADDRESS,
            "network": "testnet",
        },
        "loan": {
            "id": "chain-loan:probe",
            "offerId": "starter-float",
            "principal": 7500,
            "feeAmount": 187.5,
            "totalOwed": 7687.5,
            "remainingOwed": 7687.5,
            "collateralAmount": 11250,
            "collateralKind": "ckb",
            "borrowTxHash": "0x" + ("ab" * 32),
            "debtOutPoint": {"txHash": "0x" + ("cd" * 32), "index": 0},
            "lockedCollateralOutPoint": {"txHash": "0x" + ("ef" * 32), "index": 1},
        },
    }
    return validate_input_response(post_json(url, body, token, timeout), "repay", ("debtCell", "lockedCollateralCell"))


def probe_signer(url: str, token: str, reserve_cells: list[dict[str, Any]], timeout: float) -> dict[str, Any]:
    reserve = first_out_point(reserve_cells) or {"txHash": "0x" + ("71" * 32), "index": 0}
    body = {
        "protocol": "cellshire.bank.reserve-sign",
        "version": 1,
        "action": "borrow",
        "payload": {
            "action": "borrow",
            "tx_nonce": "bank-readiness-probe",
            "offer_id": "starter-float",
            "principal": 7500,
        },
        "tx": {
            "inputs": [{"since": "0x0", "previousOutput": reserve}],
            "outputs": [],
            "outputsData": [],
            "cellDeps": [],
            "witnesses": ["0x"],
        },
        "script_config": {
            "complete": True,
            "production": True,
            "issues": [],
            "cellDeps": [],
        },
    }
    response = post_json(url, body, token, timeout)
    if not response["ok"]:
        return response
    data = response["body"]
    if data.get("ok") is False:
        return {
            "ok": False,
            "status": "reachable-rejected",
            "reason": text(data.get("reason")) or "rejected",
            "httpStatus": response["httpStatus"],
        }
    if data.get("protocol") not in (None, BANK_RESERVE_SIGNER_RESPONSE_PROTOCOL):
        return invalid("invalid signer response protocol", response)
    if data.get("version") not in (None, 1):
        return invalid("invalid signer response version", response)
    has_signature = any(key in data for key in ("bankWitness", "extraWitnesses", "witnesses", "tx"))
    if not has_signature:
        return invalid("missing signer witness or replacement tx", response)
    return {"ok": True, "status": "pass", "httpStatus": response["httpStatus"]}


def validate_input_response(response: dict[str, Any], action: str, required_cells: tuple[str, ...]) -> dict[str, Any]:
    if not response["ok"]:
        return response
    data = response["body"]
    if data.get("ok") is False:
        return {
            "ok": False,
            "status": "rejected",
            "reason": text(data.get("reason")) or "rejected",
            "httpStatus": response["httpStatus"],
        }
    if data.get("protocol") not in (None, BANK_INPUT_PROVIDER_RESPONSE_PROTOCOL):
        return invalid("invalid input provider response protocol", response)
    if data.get("version") not in (None, 1):
        return invalid("invalid input provider response version", response)
    section = data.get(action) if isinstance(data.get(action), dict) else data
    missing = [name for name in required_cells if not isinstance(section.get(name), dict)]
    if missing:
        return invalid(f"missing {action} cells: {', '.join(missing)}", response)
    return {"ok": True, "status": "pass", "httpStatus": response["httpStatus"]}


def post_json(url: str, body: dict[str, Any], token: str, timeout: float) -> dict[str, Any]:
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return {
                "ok": True,
                "status": "reachable",
                "httpStatus": response.status,
                "body": json.loads(payload or "{}"),
            }
    except HTTPError as err:
        payload = err.read().decode("utf-8")
        try:
            parsed = json.loads(payload or "{}")
        except json.JSONDecodeError:
            parsed = {"raw": payload}
        return {
            "ok": False,
            "status": "http-error",
            "httpStatus": err.code,
            "reason": text(parsed.get("reason")) or text(parsed.get("raw")) or str(err),
        }
    except (URLError, TimeoutError, json.JSONDecodeError) as err:
        return {
            "ok": False,
            "status": "request-failed",
            "reason": str(err),
        }


def invalid(reason: str, response: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": False,
        "status": "invalid-response",
        "reason": reason,
        "httpStatus": response.get("httpStatus"),
    }


def missing_url(label: str) -> dict[str, Any]:
    return {
        "ok": False,
        "status": "missing-url",
        "reason": f"missing {label} URL",
    }


def first_out_point(cells: list[dict[str, Any]]) -> dict[str, Any] | None:
    for cell in cells:
        out_point = cell.get("outPoint") if isinstance(cell.get("outPoint"), dict) else cell
        tx_hash = out_point.get("txHash") or out_point.get("tx_hash")
        index = out_point.get("index")
        if isinstance(tx_hash, str) and index is not None:
            return {"txHash": tx_hash, "index": int(index)}
    return None


def list_of_dicts(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        return [value]
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def text(value: Any) -> str:
    return value if isinstance(value, str) else ""


if __name__ == "__main__":
    raise SystemExit(main())
