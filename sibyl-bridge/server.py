"""
Sibyl Memory Bridge — thin REST API over sibyl-memory-client
Runs alongside the Next.js app so TypeScript agents can read/write Sibyl Memory.

Usage:
  pip install -r requirements.txt
  python server.py

Endpoints map 1:1 to Sibyl's five-tier model:
  POST /entity          — set_entity(category, name, data)
  GET  /entity          — get_entity(category, name)
  DELETE /entity        — delete_entity(category, name)
  POST /state           — set_state(key, data)
  GET  /state           — get_state(key)
  POST /event           — write_event(acted=[...])
  GET  /events          — read_events(...)
  POST /reference       — set_reference(key, data)
  GET  /reference       — get_reference(key)
  GET  /search          — search_entities(query)
  DELETE /clear         — clear all entities in a category
  GET  /health          — health check
"""

import json
import os
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Sibyl Memory client ──────────────────────────────────────────

DB_PATH = os.environ.get("SIBYL_DB_PATH", os.path.expanduser("~/.sibyl-memory/memory.db"))

_client = None

def get_client():
    global _client
    if _client is None:
        try:
            from sibyl_memory_client import MemoryClient
            _client = MemoryClient.local(DB_PATH)
            print(f"[SibylBridge] Connected to {DB_PATH}")
        except Exception as e:
            print(f"[SibylBridge] Failed to init client: {e}")
            raise
    return _client


# ── Entity (WARM tier) ───────────────────────────────────────────

@app.route("/entity", methods=["POST"])
def set_entity():
    """set_entity(category, name, data)"""
    body = request.json
    category = body.get("category", "prowl")
    name = body["name"]
    data = body["data"]
    mem = get_client()
    mem.set_entity(category, name, data)
    return jsonify({"ok": True, "category": category, "name": name})


@app.route("/entity", methods=["GET"])
def get_entity():
    """get_entity(category, name)"""
    category = request.args.get("category", "prowl")
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "name is required"}), 400
    mem = get_client()
    entity = mem.get_entity(category, name)
    if entity is None:
        return jsonify({"data": None}), 404
    # entity may be a dict or object — normalize
    data = entity if isinstance(entity, dict) else vars(entity) if hasattr(entity, "__dict__") else str(entity)
    return jsonify({"data": data, "category": category, "name": name})


@app.route("/entity", methods=["DELETE"])
def delete_entity():
    """delete_entity(category, name)"""
    category = request.args.get("category", "prowl")
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "name is required"}), 400
    mem = get_client()
    mem.delete_entity(category, name)
    return jsonify({"ok": True})


# ── State (HOT tier) ─────────────────────────────────────────────

@app.route("/state", methods=["POST"])
def set_state():
    body = request.json
    key = body["key"]
    data = body["data"]
    mem = get_client()
    mem.set_state(key, data)
    return jsonify({"ok": True, "key": key})


@app.route("/state", methods=["GET"])
def get_state():
    key = request.args.get("key")
    if not key:
        return jsonify({"error": "key is required"}), 400
    mem = get_client()
    state = mem.get_state(key)
    return jsonify({"data": state})


# ── Event journal (COLD tier) ────────────────────────────────────

@app.route("/event", methods=["POST"])
def write_event():
    body = request.json
    acted = body.get("acted", [])
    mem = get_client()
    mem.write_event(acted=acted)
    return jsonify({"ok": True, "acted": acted})


@app.route("/events", methods=["GET"])
def read_events():
    mem = get_client()
    events = mem.read_events()
    # Normalize events to dicts
    result = []
    for e in (events or []):
        if isinstance(e, dict):
            result.append(e)
        elif hasattr(e, "__dict__"):
            result.append(vars(e))
        else:
            result.append({"raw": str(e)})
    return jsonify({"events": result})


# ── Reference (REFERENCE tier) ───────────────────────────────────

@app.route("/reference", methods=["POST"])
def set_reference():
    body = request.json
    key = body["key"]
    data = body["data"]
    mem = get_client()
    mem.set_reference(key, data)
    return jsonify({"ok": True, "key": key})


@app.route("/reference", methods=["GET"])
def get_reference():
    key = request.args.get("key")
    if not key:
        return jsonify({"error": "key is required"}), 400
    mem = get_client()
    ref = mem.get_reference(key)
    return jsonify({"data": ref})


# ── Search ────────────────────────────────────────────────────────

@app.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query:
        return jsonify({"results": []})
    mem = get_client()
    results = mem.search_entities(query)
    out = []
    for r in (results or []):
        if isinstance(r, dict):
            out.append(r)
        elif hasattr(r, "__dict__"):
            out.append(vars(r))
        else:
            out.append({"raw": str(r)})
    return jsonify({"results": out})


# ── Bulk operations ──────────────────────────────────────────────

@app.route("/list", methods=["GET"])
def list_entities():
    """List all entities, optionally filtered by category."""
    category = request.args.get("category")
    mem = get_client()
    try:
        if category:
            entities = mem.list_entities(category=category)
        else:
            entities = mem.list_entities()
        out = []
        for e in (entities or []):
            if isinstance(e, dict):
                out.append(e)
            elif hasattr(e, "__dict__"):
                out.append(vars(e))
            else:
                out.append({"raw": str(e)})
        return jsonify({"entities": out})
    except Exception as ex:
        return jsonify({"entities": [], "error": str(ex)})


@app.route("/clear", methods=["DELETE"])
def clear_all():
    """Clear all prowl entities (for deletion test)."""
    categories = request.args.getlist("categories") or [
        "prowl_cases", "prowl_hops", "prowl_patterns",
        "prowl_watchlist", "prowl_analysis"
    ]
    mem = get_client()
    cleared = []
    for cat in categories:
        try:
            entities = mem.list_entities(category=cat)
            for e in (entities or []):
                name = e.get("name", e) if isinstance(e, dict) else getattr(e, "name", str(e))
                mem.delete_entity(cat, name)
            cleared.append(cat)
        except Exception as ex:
            cleared.append(f"{cat} (error: {ex})")
    return jsonify({"ok": True, "cleared": cleared})


# ── Health ────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    try:
        mem = get_client()
        mem.get_state("__health_check__")
        return jsonify({"ok": True, "db": DB_PATH})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Run ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("SIBYL_BRIDGE_PORT", 4001))
    print(f"[SibylBridge] Starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
