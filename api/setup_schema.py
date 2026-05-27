#!/usr/bin/env python3
"""
Initialize KathiCredentials Neo4j schema.
Run once after starting the service to create constraints and indexes.

Usage: python api/setup_schema.py
"""
import sys
from neo4j import GraphDatabase

NEO4J_URI = "bolt://localhost:7688"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "experience123"

def run(query: str, params: dict = None):
    with driver.session() as session:
        session.run(query, params or {})

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

print("Creating constraints...")

constraints = [
    # Unique IDs
    "CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.agent_id IS UNIQUE",
    "CREATE CONSTRAINT host_id_unique IF NOT EXISTS FOR (h:Host) REQUIRE h.host_id IS UNIQUE",
    "CREATE CONSTRAINT credential_id_unique IF NOT EXISTS FOR (c:Credential) REQUIRE c.credential_id IS UNIQUE",
    "CREATE CONSTRAINT token_id_unique IF NOT EXISTS FOR (t:Token) REQUIRE t.token_id IS UNIQUE",
    "CREATE CONSTRAINT auditlog_id_unique IF NOT EXISTS FOR (l:AuditLog) REQUIRE l.log_id IS UNIQUE",
    # Config key for encryption key metadata
    "CREATE CONSTRAINT config_key_unique IF NOT EXISTS FOR (c:Config) REQUIRE c.key IS UNIQUE",
]

indexes = [
    "CREATE INDEX agent_name_idx IF NOT EXISTS FOR (a:Agent) ON (a.name)",
    "CREATE INDEX host_hostname_idx IF NOT EXISTS FOR (h:Host) ON (h.hostname)",
    "CREATE INDEX host_role_idx IF NOT EXISTS FOR (h:Host) ON (h.role)",
    "CREATE INDEX host_user_id_idx IF NOT EXISTS FOR (h:Host) ON (h.user_id)",
    "CREATE INDEX credential_type_idx IF NOT EXISTS FOR (c:Credential) ON (c.type)",
    "CREATE INDEX credential_user_id_idx IF NOT EXISTS FOR (c:Credential) ON (c.user_id)",
    "CREATE INDEX auditlog_timestamp_idx IF NOT EXISTS FOR (l:AuditLog) ON (l.timestamp)",
    "CREATE INDEX auditlog_action_idx IF NOT EXISTS FOR (l:AuditLog) ON (l.action)",
]

for c in constraints:
    try:
        run(c)
        print(f"  ✅ {c[:60]}...")
    except Exception as e:
        print(f"  ⚠️  {c[:60]}... → {e}")

for i in indexes:
    try:
        run(i)
        print(f"  ✅ {i[:60]}...")
    except Exception as e:
        print(f"  ⚠️  {i[:60]}... → {e}")

driver.close()
print("\n✅ Schema setup complete!")