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

    connection.commit()
    connection.close()
