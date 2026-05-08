#!/usr/bin/env python3
"""
Reads new chunks from node-chunks.db (SQLite), embeds via Ollama nomic-embed-text,
and upserts into Qdrant "network-chunks" collection.

Usage: python3 ingest_chunks.py '<json_args>'
  json_args: {db_path, cursor, batch, storage_cap_mb}
Prints JSON: {processed, new_cursor, errors, skipped}
"""

import sys
import json
import sqlite3
import urllib.request
import urllib.error

QDRANT_URL = "http://localhost:6333"
OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
EMBED_DIM = 768
COLLECTION = "network-chunks"


def http_post(url: str, body: dict, timeout: int = 30) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def http_put(url: str, body: dict, timeout: int = 15) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PUT")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def http_get(url: str, timeout: int = 10) -> dict:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def ensure_collection():
    try:
        http_get(f"{QDRANT_URL}/collections/{COLLECTION}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            http_put(f"{QDRANT_URL}/collections/{COLLECTION}", {
                "vectors": {"size": EMBED_DIM, "distance": "Cosine"}
            })
        else:
            raise


def embed(text: str) -> list:
    result = http_post(f"{OLLAMA_URL}/api/embeddings", {"model": EMBED_MODEL, "prompt": text[:2000]})
    return result["embedding"]


def hash_to_uuid(content_hash: str) -> str:
    h = "".join(c for c in content_hash.lower() if c in "0123456789abcdef")
    h = (h + "0" * 32)[:32]
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def upsert_point(point_id: str, vector: list, payload: dict):
    http_put(
        f"{QDRANT_URL}/collections/{COLLECTION}/points",
        {"points": [{"id": point_id, "vector": vector, "payload": payload}]},
    )


def evict_oldest(storage_cap_mb: int):
    # Each vector: 768 floats × 4B ≈ 3KB. Add ~512B payload overhead.
    max_points = (storage_cap_mb * 1024 * 1024) // (EMBED_DIM * 4 + 512)
    try:
        info = http_get(f"{QDRANT_URL}/collections/{COLLECTION}")
        count = info.get("result", {}).get("points_count", 0)
        if count <= max_points:
            return
        to_delete = count - max_points
        result = http_post(
            f"{QDRANT_URL}/collections/{COLLECTION}/points/scroll",
            {"limit": to_delete, "order_by": {"key": "timestamp", "direction": "asc"},
             "with_payload": False, "with_vector": False},
        )
        ids = [p["id"] for p in result.get("result", {}).get("points", [])]
        if ids:
            http_post(f"{QDRANT_URL}/collections/{COLLECTION}/points/delete", {"points": ids})
    except Exception as e:
        print(f"[ingest] eviction warning: {e}", file=sys.stderr)


def main():
    args = json.loads(sys.argv[1])
    db_path = args["db_path"]
    cursor = int(args.get("cursor", 0))
    batch = int(args.get("batch", 50))
    storage_cap_mb = int(args.get("storage_cap_mb", 512))

    ensure_collection()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT rowid, content_hash, content, metadata, timestamp "
            "FROM public_chunks WHERE rowid > ? ORDER BY rowid ASC LIMIT ?",
            (cursor, batch),
        ).fetchall()
    finally:
        conn.close()

    processed = 0
    errors = 0
    skipped = 0
    new_cursor = cursor

    for row in rows:
        content = row["content"] or ""
        if not content.strip():
            skipped += 1
            new_cursor = row["rowid"]
            continue

        try:
            metadata = {}
            try:
                metadata = json.loads(row["metadata"] or "{}")
            except Exception:
                pass

            vector = embed(content)
            point_id = hash_to_uuid(row["content_hash"])
            payload = {
                "content": content,
                "content_hash": row["content_hash"],
                "source": metadata.get("source", metadata.get("title", "")),
                "node_id": metadata.get("node_id", ""),
                "timestamp": row["timestamp"] or 0,
            }
            upsert_point(point_id, vector, payload)
            processed += 1
            new_cursor = row["rowid"]
        except Exception as e:
            errors += 1
            print(f"[ingest] error rowid={row['rowid']}: {e}", file=sys.stderr)

    if processed > 0:
        try:
            evict_oldest(storage_cap_mb)
        except Exception as e:
            print(f"[ingest] eviction error: {e}", file=sys.stderr)

    print(json.dumps({"processed": processed, "new_cursor": new_cursor, "errors": errors, "skipped": skipped}))


if __name__ == "__main__":
    main()
