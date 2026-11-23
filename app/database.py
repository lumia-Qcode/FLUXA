import sqlite3


def get_connection(database_path):
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _ensure_columns(connection, table_name, column_defs):
    """Add missing columns to table if they do not exist."""
    cursor = connection.execute(f"PRAGMA table_info({table_name})")
    existing_columns = {row["name"] for row in cursor.fetchall()}

    for col_name, col_type, default_val in column_defs:
        if col_name not in existing_columns:
            if default_val is not None:
                connection.execute(
                    f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type} DEFAULT {default_val}"
                )
            else:
                connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}")


def init_db(database_path):
    connection = get_connection(database_path)

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS presentations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS slides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            presentation_id INTEGER NOT NULL,
            slide_order INTEGER NOT NULL,
            title TEXT,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (presentation_id)
                REFERENCES presentations(id)
                ON DELETE CASCADE
        )
        """
    )

    # Guarded column additions for presentations
    _ensure_columns(
        connection,
        "presentations",
        [
            ("theme", "TEXT", '\'{"themeId":"default"}\''),
            ("datasets", "TEXT", "'{}'"),
            ("variables", "TEXT", "'{}'"),
            (
                "settings",
                "TEXT",
                '\'{"transition":{"effect":"fade","duration":300},"loop":false}\'',
            ),
            ("schema_version", "INTEGER", "1"),
            ("revision", "INTEGER", "1"),
            ("share_token", "TEXT", "NULL"),
            ("is_shared", "INTEGER", "0"),
        ],
    )

    # Guarded column additions for slides
    _ensure_columns(
        connection,
        "slides",
        [
            ("spec", "TEXT", "NULL"),
        ],
    )

    # Assets table
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            presentation_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            mime TEXT NOT NULL,
            size INTEGER NOT NULL,
            path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (presentation_id)
                REFERENCES presentations(id)
                ON DELETE CASCADE
        )
        """
    )

    # AI chat messages table
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            presentation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            ops TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (presentation_id)
                REFERENCES presentations(id)
                ON DELETE CASCADE
        )
        """
    )

    # Live meeting sessions table
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS live_sessions (
            id TEXT PRIMARY KEY,
            presentation_id INTEGER NOT NULL,
            host_token TEXT NOT NULL,
            meeting_code TEXT NOT NULL,
            current_slide_index INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
        )
        """
    )

    # Live participants table
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS live_participants (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#3B82F6',
            role TEXT DEFAULT 'viewer',
            last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE
        )
        """
    )

    # Live polls table
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS live_polls (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            slide_index INTEGER DEFAULT 0,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE
        )
        """
    )

    # Live poll votes table
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS live_poll_votes (
            id TEXT PRIMARY KEY,
            poll_id TEXT NOT NULL,
            participant_id TEXT NOT NULL,
            option_index INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(poll_id, participant_id),
            FOREIGN KEY (poll_id) REFERENCES live_polls(id) ON DELETE CASCADE
        )
        """
    )

    # Live comments and reactions stream
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS live_comments (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            participant_id TEXT,
            participant_name TEXT NOT NULL,
            slide_index INTEGER DEFAULT 0,
            text TEXT NOT NULL,
            reaction TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE
        )
        """
    )

    # Create helpful indexes
    connection.execute("CREATE INDEX IF NOT EXISTS idx_live_sessions_pres ON live_sessions(presentation_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_live_participants_sess ON live_participants(session_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_live_polls_sess ON live_polls(session_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_live_comments_sess ON live_comments(session_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_live_votes_poll ON live_poll_votes(poll_id)")

    # Accounts, organisations and deck ownership (local import: app.auth imports this module)
    from app.auth import init_auth_schema

    init_auth_schema(connection)

    from app.ai.gateway import init_schema as init_ai_schema

    init_ai_schema(connection)

    from app.brand.store import init_schema as init_brand_schema

    init_brand_schema(connection)

    from app.jobs.queue import init_schema as init_jobs_schema

    init_jobs_schema(connection)

    from app.ingest.store import init_schema as init_uploads_schema

    init_uploads_schema(connection)

    from app.privacy.store import init_schema as init_privacy_schema

    init_privacy_schema(connection)

    connection.commit()
    connection.close()
