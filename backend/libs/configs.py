import os
import ssl

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo import client_options

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "ems_dashboard")

# OpenSSL 3.5 (bundled with Python 3.13+) offers a post-quantum hybrid key
# share (X25519MLKEM768) by default in TLS 1.3 ClientHellos. Atlas's TLS
# proxy rejects that ClientHello with a malformed "internal_error" alert
# instead of falling back (SSL: TLSV1_ALERT_INTERNAL_ERROR on every shard
# node). Capping the client at TLS 1.2 drops that extension from the
# handshake entirely and avoids the bug. pymongo has no public option for
# this, so the context it builds is patched after the fact. client_options
# imports get_ssl_context by name (`from pymongo.ssl_support import
# get_ssl_context`), so that binding - not the one on the ssl_support
# module - is what has to be replaced for this to take effect.
_get_ssl_context = client_options.get_ssl_context


def _get_ssl_context_capped(*args, **kwargs):
    ctx = _get_ssl_context(*args, **kwargs)
    ctx.maximum_version = ssl.TLSVersion.TLSv1_2
    return ctx


client_options.get_ssl_context = _get_ssl_context_capped

# Explicit CA bundle: on Windows, newer Python/OpenSSL builds fail the TLS
# handshake against Atlas without this (SSL: TLSV1_ALERT_INTERNAL_ERROR).
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

# Angular dev server origins allowed to call this API.
CORS_ORIGINS = [
    "http://localhost:4200",
    "http://127.0.0.1:4200"
]
