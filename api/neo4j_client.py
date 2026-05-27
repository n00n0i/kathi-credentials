from neo4j import GraphDatabase, basic_auth
from api.config import get_settings
from typing import Optional
from datetime import datetime
import uuid


class Neo4jClient:
    _instance: Optional['Neo4jClient'] = None

    def __init__(self):
        settings = get_settings()
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=basic_auth(settings.neo4j_user, settings.neo4j_password),
        )

    @classmethod
    def get_instance(cls) -> 'Neo4jClient':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def close(self):
        if self._instance:
            self._instance.driver.close()
            cls._instance = None

    def verify_connectivity(self) -> bool:
        try:
            with self.driver.session() as session:
                session.run("RETURN 1")
            return True
        except Exception:
            return False

    # ── Agent ────────────────────────────────────────────────────────────────

    def create_agent(self, name: str, permissions: list[str]) -> dict:
        """Returns dict with agent_id, token, created_at"""
        agent_id = f"ag_{uuid.uuid4().hex[:12]}"
        token_value = f"kc_{uuid.uuid4().hex}"
        token_id = f"tk_{uuid.uuid4().hex[:12]}"
        created_at = datetime.utcnow().isoformat()

        with self.driver.session() as session:
            session.run("""
                CREATE (a:Agent {agent_id: $agent_id, name: $name,
                  permissions: $permissions, created_at: datetime(), is_active: true})
                CREATE (t:Token {token_id: $token_id, value: $token_value,
                  agent_id: $agent_id, permissions: $permissions,
                  expires_at: null, is_active: true, created_at: datetime()})
                CREATE (a)-[:HAS_TOKEN]->(t)
                """,
                agent_id=agent_id, name=name, permissions=permissions,
                token_id=token_id, token_value=token_value)
        return {
            "agent_id": agent_id,
            "token": token_value,
            "created_at": created_at,
        }

    def get_agent_by_token(self, token: str) -> Optional[dict]:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (a:Agent)-[:HAS_TOKEN]->(t:Token)
                WHERE t.value = $token AND t.is_active = true AND a.is_active = true
                RETURN a.agent_id AS agent_id, a.name AS name, a.permissions AS permissions,
                       t.expires_at AS expires_at
                """, token=token)
            record = result.single()
            if record:
                d = dict(record)
                # Convert Neo4j DateTime to ISO string
                for key in ("expires_at", "created_at"):
                    val = d.get(key)
                    if hasattr(val, 'isoformat'):
                        d[key] = val.isoformat()
                    elif val is not None:
                        d[key] = str(val)
                return d
        return None

    def get_agents(self) -> list[dict]:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (a:Agent)-[:HAS_TOKEN]->(t:Token)
                WHERE a.is_active = true AND t.is_active = true
                RETURN a.agent_id AS agent_id, a.name AS name, a.permissions AS permissions,
                       t.value AS token_value, t.created_at AS created_at, a.is_active AS is_active
                ORDER BY a.created_at DESC
                """)
            return [dict(r) for r in result]

    def revoke_agent(self, agent_id: str) -> bool:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (a:Agent {agent_id: $agent_id})
                SET a.is_active = false
                WITH a
                MATCH (a)-[:HAS_TOKEN]->(t:Token)
                SET t.is_active = false
                RETURN count(t) AS revoked_count
                """, agent_id=agent_id)
            return result.single()["revoked_count"] > 0

    def get_agent_count(self) -> int:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (a:Agent) WHERE a.is_active = true RETURN count(a) AS cnt
                """)
            return result.single()["cnt"]

    def validate_agent_token(self, token: str) -> Optional[dict]:
        """Validate agent token, returns {valid, agent_id} or None."""
        agent = self.get_agent_by_token(token)
        if not agent:
            return None
        # Check expiry
        if agent.get("expires_at"):
            expires = agent["expires_at"]
            if hasattr(expires, 'isoformat'):
                expires = datetime.fromisoformat(expires.isoformat())
            elif isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if datetime.utcnow() > expires:
                return None
        return {"valid": True, "agent_id": agent["agent_id"]}

    def get_agent(self, agent_id: str) -> Optional[dict]:
        """Get full agent details by agent_id."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (a:Agent {agent_id: $agent_id})-[:HAS_TOKEN]->(t:Token)
                WHERE a.is_active = true AND t.is_active = true
                RETURN a.agent_id AS agent_id, a.name AS name,
                       a.permissions AS permissions, a.is_active AS is_active,
                       t.value AS token_value, t.created_at AS created_at,
                       t.expires_at AS expires_at
                """, agent_id=agent_id)
            record = result.single()
            if not record:
                return None
            d = dict(record)
            for key in ("expires_at", "created_at"):
                val = d.get(key)
                if hasattr(val, 'isoformat'):
                    d[key] = val.isoformat()
                elif val is not None:
                    d[key] = str(val)
            return d

    def get_agent_tokens(self, agent_id: str) -> list[dict]:
        """Get all active tokens for an agent."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (a:Agent {agent_id: $agent_id})-[:HAS_TOKEN]->(t:Token)
                WHERE a.is_active = true AND t.is_active = true
                RETURN t.value AS token_value, t.created_at AS created_at,
                       t.expires_at AS expires_at
                ORDER BY t.created_at DESC
                """, agent_id=agent_id)
            tokens = []
            for r in result:
                d = dict(r)
                for key in ("expires_at", "created_at"):
                    val = d.get(key)
                    if hasattr(val, 'isoformat'):
                        d[key] = val.isoformat()
                    elif val is not None:
                        d[key] = str(val)
                tokens.append(d)
            return tokens

    # ── Host ────────────────────────────────────────────────────────────────

    def create_host(self, hostname: str, ip: str, role: str, owner: str,
                    tags: list[str], environment: str, user_id: str) -> dict:
        host_id = f"host_{uuid.uuid4().hex[:12]}"
        created_at = datetime.utcnow().isoformat()
        with self.driver.session() as session:
            session.run("""
                CREATE (h:Host {host_id: $host_id, hostname: $hostname, ip: $ip,
                  role: $role, owner: $owner, tags: $tags, environment: $environment,
                  user_id: $user_id, created_at: datetime()})
                """, host_id=host_id, hostname=hostname, ip=ip, role=role,
                owner=owner, tags=tags, environment=environment, user_id=user_id)
        return {
            "host_id": host_id,
            "hostname": hostname,
            "ip": ip,
            "role": role,
            "owner": owner,
            "tags": tags,
            "environment": environment,
            "created_at": created_at,
        }

    def list_hosts(self, tags: Optional[list[str]] = None,
                   role: Optional[str] = None,
                   user_id: Optional[str] = None) -> list[dict]:
        with self.driver.session() as session:
            query = "MATCH (h:Host) WHERE true"
            params = {}
            if user_id:
                query += " AND h.user_id = $user_id"
                params["user_id"] = user_id
            if role:
                query += " AND h.role = $role"
                params["role"] = role
            if tags:
                query += " AND any(tag IN $tags WHERE tag IN h.tags)"
                params["tags"] = tags
            query += " RETURN h.host_id AS host_id, h.hostname AS hostname, h.ip AS ip, h.role AS role, h.owner AS owner, h.tags AS tags, h.environment AS environment, h.created_at AS created_at ORDER BY h.created_at DESC"
            result = session.run(query, params)
            return [dict(r) for r in result]

    def get_host(self, host_id: str, user_id: Optional[str] = None) -> Optional[dict]:
        with self.driver.session() as session:
            query = """
                MATCH (h:Host {host_id: $host_id})
                """
            params = {"host_id": host_id}
            if user_id:
                query += " WHERE h.user_id = $user_id"
                params["user_id"] = user_id
            query += """
                RETURN h.host_id AS host_id, h.hostname AS hostname, h.ip AS ip,
                       h.role AS role, h.owner AS owner, h.tags AS tags,
                       h.environment AS environment, h.created_at AS created_at
                """
            result = session.run(query, params)
            record = result.single()
            return dict(record) if record else None

    def get_host_count(self) -> int:
        with self.driver.session() as session:
            result = session.run("MATCH (h:Host) RETURN count(h) AS cnt")
            return result.single()["cnt"]

    def update_host(self, host_id: str,
                    hostname: Optional[str] = None,
                    ip: Optional[str] = None,
                    role: Optional[str] = None,
                    owner: Optional[str] = None,
                    environment: Optional[str] = None,
                    tags: Optional[list[str]] = None,
                    user_id: Optional[str] = None) -> Optional[dict]:
        set_clauses = []
        params = {"host_id": host_id}
        if hostname is not None:
            set_clauses.append("h.hostname = $hostname")
            params["hostname"] = hostname
        if ip is not None:
            set_clauses.append("h.ip = $ip")
            params["ip"] = ip
        if role is not None:
            set_clauses.append("h.role = $role")
            params["role"] = role
        if owner is not None:
            set_clauses.append("h.owner = $owner")
            params["owner"] = owner
        if environment is not None:
            set_clauses.append("h.environment = $environment")
            params["environment"] = environment
        if tags is not None:
            set_clauses.append("h.tags = $tags")
            params["tags"] = tags
        if not set_clauses:
            return self.get_host(host_id, user_id)
        with self.driver.session() as session:
            where = "h.host_id = $host_id"
            if user_id:
                where += " AND h.user_id = $user_id"
                params["user_id"] = user_id
            result = session.run(f"""
                MATCH (h:Host) WHERE {where}
                SET {', '.join(set_clauses)}
                RETURN h.host_id AS host_id, h.hostname AS hostname, h.ip AS ip,
                       h.role AS role, h.owner AS owner, h.tags AS tags,
                       h.environment AS environment, h.created_at AS created_at
            """, params)
            record = result.single()
            if not record:
                return None
            out = dict(record)
            if out.get("created_at"):
                out["created_at"] = out["created_at"].isoformat()
            return out

    def delete_host(self, host_id: str, user_id: Optional[str] = None) -> bool:
        """Returns True if deleted, False if not found (wrong owner)."""
        with self.driver.session() as session:
            where = "h.host_id = $host_id"
            params = {"host_id": host_id}
            if user_id:
                where += " AND h.user_id = $user_id"
                params["user_id"] = user_id
            result = session.run(f"""
                MATCH (h:Host) WHERE {where}
                DETACH DELETE h
                RETURN count(h) AS deleted
            """, params)
            count = result.single()["deleted"]
            return count > 0

    def search_hosts(self, query: str, user_id: Optional[str] = None) -> list[dict]:
        with self.driver.session() as session:
            params = {"q": query}
            where = "h.hostname CONTAINS $q OR h.ip CONTAINS $q OR h.role CONTAINS $q"
            if user_id:
                where += " AND h.user_id = $user_id"
                params["user_id"] = user_id
            result = session.run(f"""
                MATCH (h:Host)
                WHERE {where}
                RETURN h.host_id AS host_id, h.hostname AS hostname, h.ip AS ip,
                       h.role AS role, h.owner AS owner, h.tags AS tags,
                       h.environment AS environment, h.created_at AS created_at
                ORDER BY h.hostname
                """, params)
            return [dict(r) for r in result]

    # ── Credential ──────────────────────────────────────────────────────────

    def create_credential(self, host_id: str, cred_type: str, key_ref: str,
                          encrypted_value: str, owner: str, user_id: str,
                          name: str = "", username: str = "", environment: str = "") -> dict:
        credential_id = f"cred_{uuid.uuid4().hex[:12]}"
        created_at = datetime.utcnow().isoformat()
        with self.driver.session() as session:
            session.run("""
                MATCH (h:Host {host_id: $host_id, user_id: $user_id})
                CREATE (c:Credential {credential_id: $credential_id, type: $cred_type,
                  key_ref: $key_ref, name: $name, username: $username, encrypted_value: $encrypted_value,
                  owner: $owner, environment: $environment,
                  user_id: $user_id, created_at: datetime(), updated_at: datetime()})
                CREATE (h)-[:OWNS]->(c)
                """, host_id=host_id, credential_id=credential_id,
                cred_type=cred_type, key_ref=key_ref, name=name, username=username,
                encrypted_value=encrypted_value, owner=owner,
                environment=environment, user_id=user_id)
        return {
            "credential_id": credential_id,
            "host_id": host_id,
            "name": name,
            "type": cred_type,
            "key_ref": key_ref,
            "owner": owner,
            "environment": environment,
            "created_at": created_at,
        }

    def list_credentials(self, host_id: str, user_id: str) -> list[dict]:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (h:Host {host_id: $host_id, user_id: $user_id})-[:OWNS]->(c:Credential)
                RETURN c.credential_id AS credential_id, c.type AS type,
                       c.key_ref AS key_ref, c.owner AS owner, c.created_at AS created_at
                ORDER BY c.created_at DESC
                """, host_id=host_id, user_id=user_id)
            creds = [dict(r) for r in result]
            for c in creds:
                for key in ("created_at",):
                    val = c.get(key)
                    if hasattr(val, 'isoformat'):
                        c[key] = val.isoformat()
                    elif val is not None:
                        c[key] = str(val)
            return creds

    def list_all_credentials(self, user_id: Optional[str] = None) -> list[dict]:
        """List all credentials across all hosts, optionally filtered by user_id."""
        with self.driver.session() as session:
            if user_id:
                result = session.run("""
                    MATCH (h:Host {user_id: $user_id})-[:OWNS]->(c:Credential)
                    RETURN c.credential_id AS credential_id, c.type AS type,
                           c.key_ref AS key_ref, c.name AS name, c.username AS username,
                           c.owner AS owner, c.environment AS environment,
                           c.created_at AS created_at, h.host_id AS host_id, h.hostname AS hostname
                    ORDER BY c.created_at DESC
                    LIMIT 1000
                    """, user_id=user_id)
            else:
                result = session.run("""
                    MATCH (c:Credential)
                    OPTIONAL MATCH (h:Host)-[:OWNS]->(c)
                    RETURN c.credential_id AS credential_id, c.type AS type,
                           c.key_ref AS key_ref, c.name AS name, c.username AS username,
                           c.owner AS owner, c.environment AS environment,
                           c.created_at AS created_at, h.host_id AS host_id, h.hostname AS hostname
                    ORDER BY c.created_at DESC
                    LIMIT 1000
                    """)
            creds = [dict(r) for r in result]
            for c in creds:
                for key in ("created_at",):
                    val = c.get(key)
                    if hasattr(val, 'isoformat'):
                        c[key] = val.isoformat()
                    elif val is not None:
                        c[key] = str(val)
            return creds

    def get_credential(self, credential_id: str, user_id: Optional[str] = None) -> Optional[dict]:
        with self.driver.session() as session:
            if user_id:
                result = session.run("""
                    MATCH (h:Host {user_id: $user_id})-[:OWNS]->(c:Credential {credential_id: $credential_id})
                    RETURN c.credential_id AS credential_id, c.type AS type,
                           c.key_ref AS key_ref, c.name AS name, c.username AS username,
                           c.encrypted_value AS encrypted_value,
                           c.owner AS owner, c.created_at AS created_at
                    """, credential_id=credential_id, user_id=user_id)
            else:
                result = session.run("""
                    MATCH (c:Credential {credential_id: $credential_id})
                    RETURN c.credential_id AS credential_id, c.type AS type,
                           c.key_ref AS key_ref, c.name AS name, c.username AS username,
                           c.encrypted_value AS encrypted_value,
                           c.owner AS owner, c.created_at AS created_at
                    """, credential_id=credential_id)
            record = result.single()
            if not record:
                return None
            d = dict(record)
            for key in ("created_at",):
                val = d.get(key)
                if hasattr(val, 'isoformat'):
                    d[key] = val.isoformat()
                elif val is not None:
                    d[key] = str(val)
            return d

    def get_credential_count(self) -> int:
        with self.driver.session() as session:
            result = session.run("MATCH (c:Credential) RETURN count(c) AS cnt")
            return result.single()["cnt"]

    # ── Audit ───────────────────────────────────────────────────────────────

    def create_audit_log(self, action: str, agent_id: str, resource_type: str,
                          resource_id: str, success: bool) -> str:
        log_id = f"log_{uuid.uuid4().hex[:12]}"
        with self.driver.session() as session:
            session.run("""
                MATCH (a:Agent {agent_id: $agent_id})
                CREATE (l:AuditLog {log_id: $log_id, action: $action, agent_id: $agent_id,
                  resource_type: $resource_type, resource_id: $resource_id,
                  timestamp: datetime(), success: $success})
                CREATE (l)-[:BY]->(a)
                """, log_id=log_id, action=action, agent_id=agent_id,
                resource_type=resource_type, resource_id=resource_id, success=success)
        return log_id

    def get_audit_logs(self, agent_id: Optional[str] = None,
                        credential_id: Optional[str] = None,
                        from_date: Optional[str] = None,
                        to_date: Optional[str] = None,
                        limit: int = 100) -> list[dict]:
        with self.driver.session() as session:
            query = """
                MATCH (l:AuditLog)-[:BY]->(a:Agent)
                WHERE true
                """
            params = {}
            if agent_id:
                query += " AND l.agent_id = $agent_id"
                params["agent_id"] = agent_id
            if credential_id:
                query += " AND l.resource_id = $credential_id AND l.resource_type = 'credential'"
                params["credential_id"] = credential_id
            if from_date:
                query += " AND l.timestamp >= datetime($from_date)"
                params["from_date"] = from_date
            if to_date:
                query += " AND l.timestamp <= datetime($to_date)"
                params["to_date"] = to_date
            query += " RETURN l.log_id AS log_id, l.timestamp AS timestamp, l.agent_id AS agent_id, a.name AS agent_name, l.action AS action, l.resource_type AS resource_type, l.resource_id AS resource_id, l.success AS success ORDER BY l.timestamp DESC LIMIT $limit"
            params["limit"] = limit
            result = session.run(query, params)
            return [dict(r) for r in result]

    # ── Telegram Config ────────────────────────────────────────────────────

    def get_telegram_config(self) -> Optional[dict]:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (t:TelegramConfig) RETURN t.bot_token AS bot_token,
                  t.chat_id AS chat_id, t.is_enabled AS is_enabled LIMIT 1
                """)
            record = result.single()
            return dict(record) if record else None

    def save_telegram_config(self, encrypted_bot_token: str, chat_id: str, is_enabled: bool):
        with self.driver.session() as session:
            session.run("""
                MERGE (t:TelegramConfig)
                SET t.bot_token = $bot_token, t.chat_id = $chat_id, t.is_enabled = $is_enabled
                """, bot_token=encrypted_bot_token, chat_id=chat_id, is_enabled=is_enabled)

    def get_encryption_key_created_at(self) -> Optional[str]:
        """Returns when the encryption key was first set up (from a config node)."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (c:Config {key: 'encryption_key_created_at'})
                RETURN c.value AS value LIMIT 1
                """)
            record = result.single()
            return record["value"] if record else None

    def set_encryption_key_created_at(self, created_at: str):
        with self.driver.session() as session:
            session.run("""
                MERGE (c:Config {key: 'encryption_key_created_at'})
                SET c.value = $created_at
                """, created_at=created_at)

    # ── Admin Token (sk- format) ─────────────────────────────────────────────
    def get_admin_token(self) -> Optional[str]:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (c:Config {key: 'admin_token'})
                RETURN c.value as value
                """)
            record = result.single()
            return record["value"] if record else None

    def save_admin_token(self, token: str):
        with self.driver.session() as session:
            session.run("""
                MERGE (c:Config {key: 'admin_token'})
                SET c.value = $token
                """, token=token)

    def get_config(self, key: str) -> Optional[str]:
        """Get a config value by key."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (c:Config {key: $key})
                RETURN c.value as value
                """, key=key)
            record = result.single()
            return record["value"] if record else None

    def set_config(self, key: str, value: str):
        """Set a config value by key."""
        with self.driver.session() as session:
            session.run("""
                MERGE (c:Config {key: $key})
                SET c.value = $value
                """, key=key, value=value)

    # ── Sessions ─────────────────────────────────────────────────────────────
    def create_session(self, admin_token_hash: str, expires_at: datetime) -> dict:
        """Create a new browser session. Returns {session_token, expires_at}."""
        session_token = f"ses_{uuid.uuid4().hex[:24]}"
        created_at = datetime.utcnow().isoformat()
        expires_at_str = expires_at.isoformat()
        with self.driver.session() as session:
            session.run("""
                CREATE (s:Session {
                    session_token: $session_token,
                    admin_token_hash: $admin_token_hash,
                    created_at: datetime(),
                    expires_at: datetime($expires_at),
                    is_active: true
                })
                """,
                session_token=session_token,
                admin_token_hash=admin_token_hash,
                expires_at=expires_at_str)
        return {
            "session_token": session_token,
            "expires_at": expires_at_str,
            "created_at": created_at,
        }

    def get_session(self, session_token: str) -> Optional[dict]:
        """Validate session token and return session info if valid."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (s:Session)
                WHERE s.session_token = $session_token
                  AND s.is_active = true
                  AND s.expires_at > datetime()
                RETURN s.session_token AS session_token,
                       s.expires_at AS expires_at,
                       s.admin_token_hash AS admin_token_hash,
                       s.created_at AS created_at
                """, session_token=session_token)
            record = result.single()
            if not record:
                return None
            d = dict(record)
            # Convert Neo4j DateTime to ISO string for all datetime fields
            for key in ("expires_at", "created_at"):
                val = d.get(key)
                if hasattr(val, 'isoformat'):
                    d[key] = val.isoformat()
                elif val is not None:
                    d[key] = str(val)
            return d

    def delete_session(self, session_token: str) -> bool:
        """Logout: deactivate session."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (s:Session {session_token: $session_token})
                SET s.is_active = false
                RETURN count(s) AS cnt
                """, session_token=session_token)
            return (result.single() or {}).get("cnt", 0) > 0

    def cleanup_expired_sessions(self) -> int:
        """Remove expired sessions. Returns count deleted."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (s:Session)
                WHERE s.is_active = true AND s.expires_at <= datetime()
                SET s.is_active = false
                RETURN count(s) AS cnt
                """)
            return (result.single() or {}).get("cnt", 0)

    def hash_token(self, token: str) -> str:
        """Simple SHA-256 hash of a token (for storing in session)."""
        import hashlib
        return hashlib.sha256(token.encode()).hexdigest()


def get_neo4j() -> Neo4jClient:
    return Neo4jClient.get_instance()