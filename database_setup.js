import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function setupDatabase() {
    const db = await open({
        filename: 'bot.db',
        driver: sqlite3.Database
    });

    // Trivia
    await db.exec(`
        CREATE TABLE IF NOT EXISTS trivia_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            question TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            incorrect_answers TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE TABLE IF NOT EXISTS trivia_stats (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            total_questions INTEGER DEFAULT 0,
            correct_answers INTEGER DEFAULT 0,
            total_points INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            max_streak INTEGER DEFAULT 0,
            last_played INTEGER,
            PRIMARY KEY (user_id, guild_id)
        );
    `);

    // Encuestas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            question TEXT NOT NULL,
            choices TEXT NOT NULL,
            duration INTEGER NOT NULL,
            multiple_votes INTEGER DEFAULT 0,
            anonymous INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS poll_votes (
            poll_id INTEGER NOT NULL,
            votes TEXT NOT NULL,
            PRIMARY KEY (poll_id),
            FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
        );
    `);

    // Eventos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            location TEXT,
            max_participants INTEGER,
            required_role_id TEXT,
            reminder_times TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS event_participants (
            event_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            status TEXT NOT NULL,
            registered_at INTEGER NOT NULL,
            PRIMARY KEY (event_id, user_id),
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        );
    `);

    await db.close();
    console.log('Base de datos configurada correctamente.');
}

setupDatabase().catch(console.error); 