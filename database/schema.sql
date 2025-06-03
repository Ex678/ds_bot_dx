-- Tabla para las preguntas de trivia
CREATE TABLE IF NOT EXISTS trivia_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    incorrect_answers TEXT NOT NULL, -- Respuestas incorrectas separadas por |
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para las estadísticas de trivia por usuario y servidor
CREATE TABLE IF NOT EXISTS trivia_stats (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    last_played TIMESTAMP,
    PRIMARY KEY (user_id, guild_id)
);

-- Tabla para el ranking global de trivia
CREATE TABLE IF NOT EXISTS trivia_leaderboard (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    season INTEGER NOT NULL DEFAULT 1,
    points INTEGER DEFAULT 0,
    rank INTEGER,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, guild_id, season)
);

-- Tabla para encuestas
CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    choices TEXT NOT NULL, -- Array de opciones en formato JSON
    duration INTEGER NOT NULL, -- Duración en minutos
    multiple_votes BOOLEAN DEFAULT 0,
    anonymous BOOLEAN DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_by TEXT NOT NULL, -- ID del usuario que creó la encuesta
    guild_id TEXT NOT NULL -- ID del servidor
);

-- Tabla para votos de encuestas
CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id INTEGER NOT NULL,
    votes TEXT NOT NULL, -- Mapa de votos en formato JSON {userId: choiceIndex}
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (poll_id),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

-- Tabla para recordatorios
CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    reminder_time TIMESTAMP NOT NULL,
    repeat BOOLEAN DEFAULT 0,
    repeat_interval TEXT CHECK (repeat_interval IN ('daily', 'weekly', 'monthly') OR repeat_interval IS NULL),
    completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    last_triggered TIMESTAMP
);

-- Tabla para notas
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT DEFAULT '[]', -- Array de etiquetas en formato JSON
    pinned BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar las consultas
CREATE INDEX IF NOT EXISTS idx_trivia_questions_category ON trivia_questions(category);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_difficulty ON trivia_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_trivia_stats_points ON trivia_stats(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_leaderboard_points ON trivia_leaderboard(points DESC);
CREATE INDEX IF NOT EXISTS idx_polls_guild ON polls(guild_id);
CREATE INDEX IF NOT EXISTS idx_polls_expiry ON polls(expires_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(reminder_time);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(completed, reminder_time);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_notes_search ON notes(title, content);

-- Vista para el ranking global
CREATE VIEW IF NOT EXISTS v_trivia_ranking AS
SELECT 
    ts.user_id,
    ts.guild_id,
    ts.total_points,
    ts.correct_answers,
    ts.total_questions,
    ts.max_streak,
    RANK() OVER (PARTITION BY ts.guild_id ORDER BY ts.total_points DESC) as rank
FROM trivia_stats ts;

-- Vista para encuestas activas
CREATE VIEW IF NOT EXISTS v_active_polls AS
SELECT 
    p.*,
    COUNT(DISTINCT JSON_EACH.value) as total_votes
FROM polls p
LEFT JOIN poll_votes pv ON p.id = pv.poll_id
LEFT JOIN JSON_EACH(pv.votes) ON TRUE
WHERE p.expires_at > CURRENT_TIMESTAMP
GROUP BY p.id;

-- Vista para recordatorios pendientes
CREATE VIEW IF NOT EXISTS v_pending_reminders AS
SELECT 
    r.*,
    CASE 
        WHEN r.repeat = 1 THEN 'Recurrente'
        ELSE 'Único'
    END as tipo,
    CASE
        WHEN r.reminder_time <= CURRENT_TIMESTAMP THEN 'Vencido'
        WHEN r.reminder_time <= CURRENT_TIMESTAMP + 300 THEN 'Próximo'
        ELSE 'Pendiente'
    END as estado
FROM reminders r
WHERE r.completed = 0;

-- Vista para notas con estadísticas
CREATE VIEW IF NOT EXISTS v_notes_stats AS
SELECT 
    n.*,
    (SELECT COUNT(*) FROM notes n2 
     WHERE n2.user_id = n.user_id 
     AND n2.guild_id = n.guild_id 
     AND n2.category = n.category) as notes_in_category,
    (SELECT COUNT(*) FROM notes n3 
     WHERE n3.user_id = n.user_id 
     AND n3.guild_id = n.guild_id 
     AND n3.pinned = 1) as pinned_notes,
    json_array_length(n.tags) as tag_count
FROM notes n;

-- Insertar algunas preguntas de ejemplo
INSERT OR IGNORE INTO trivia_questions (question, correct_answer, incorrect_answers, category, difficulty) VALUES
    ('¿Cuál es el planeta más grande del Sistema Solar?', 'Júpiter', 'Saturno|Neptuno|Urano', 'science', 'easy'),
    ('¿En qué año comenzó la Segunda Guerra Mundial?', '1939', '1938|1940|1941', 'history', 'easy'),
    ('¿Cuál es la capital de Japón?', 'Tokio', 'Kioto|Osaka|Yokohama', 'geography', 'easy'),
    ('¿Quién pintó "La noche estrellada"?', 'Vincent van Gogh', 'Pablo Picasso|Claude Monet|Salvador Dalí', 'art', 'medium'),
    ('¿Cuál es el elemento químico más abundante en el universo?', 'Hidrógeno', 'Helio|Oxígeno|Carbono', 'science', 'medium'),
    ('¿Qué lenguaje de programación fue creado por Guido van Rossum?', 'Python', 'Java|C++|JavaScript', 'tech', 'medium'),
    ('¿En qué año se fundó Microsoft?', '1975', '1976|1974|1977', 'tech', 'medium'),
    ('¿Cuál fue la primera consola de Nintendo?', 'Game & Watch', 'NES|Game Boy|SNES', 'gaming', 'hard'),
    ('¿Quién compuso la "Novena Sinfonía"?', 'Ludwig van Beethoven', 'Wolfgang Amadeus Mozart|Johann Sebastian Bach|Franz Schubert', 'music', 'medium'),
    ('¿Qué equipo ha ganado más Champions League?', 'Real Madrid', 'AC Milan|Bayern Munich|Barcelona', 'sports', 'medium');

-- Sistema de Eventos
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    location TEXT,
    max_participants INTEGER,
    required_role_id TEXT,
    reminder_times TEXT DEFAULT '[]', -- Array de tiempos en minutos antes del evento [60, 30, 10]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_participants (
    event_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('registered', 'waitlist', 'cancelled')),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_reminders_sent (
    event_id INTEGER NOT NULL,
    reminder_time INTEGER NOT NULL, -- Minutos antes del evento
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, reminder_time),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Sistema de Niveles
CREATE TABLE IF NOT EXISTS levels (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    messages INTEGER DEFAULT 0,
    last_message_time TIMESTAMP,
    PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS level_roles (
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, level)
);

CREATE TABLE IF NOT EXISTS xp_multipliers (
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'role', 'channel', 'event'
    target_id TEXT NOT NULL, -- role_id, channel_id o event_id
    multiplier FLOAT NOT NULL DEFAULT 1.0,
    PRIMARY KEY (guild_id, type, target_id)
);

-- Sistema de Moderación
CREATE TABLE IF NOT EXISTS mod_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('warn', 'mute', 'kick', 'ban', 'unmute', 'unban')),
    reason TEXT,
    duration INTEGER, -- Duración en minutos para mutes temporales
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mod_config (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    mute_role_id TEXT,
    auto_mod_enabled BOOLEAN DEFAULT 0,
    spam_threshold INTEGER DEFAULT 5,
    spam_interval INTEGER DEFAULT 5000, -- en milisegundos
    raid_protection_enabled BOOLEAN DEFAULT 0,
    raid_join_threshold INTEGER DEFAULT 10,
    raid_time_threshold INTEGER DEFAULT 10000, -- en milisegundos
    filtered_words TEXT DEFAULT '[]', -- Array de palabras filtradas
    warn_thresholds TEXT DEFAULT '{"3": "mute", "5": "kick", "7": "ban"}' -- JSON de umbrales
);

CREATE TABLE IF NOT EXISTS auto_mod_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'spam', 'raid', 'words', 'mentions'
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sistema de Bienvenida
CREATE TABLE IF NOT EXISTS welcome_config (
    guild_id TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT 0,
    channel_id TEXT,
    message TEXT,
    embed_enabled BOOLEAN DEFAULT 0,
    embed_title TEXT,
    embed_description TEXT,
    embed_color INTEGER,
    embed_thumbnail BOOLEAN DEFAULT 1,
    dm_message TEXT,
    default_role_id TEXT
);

CREATE TABLE IF NOT EXISTS welcome_stats (
    guild_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    joins INTEGER DEFAULT 0,
    leaves INTEGER DEFAULT 0,
    retention_rate FLOAT DEFAULT 0,
    PRIMARY KEY (guild_id, date)
);

-- Sistema de Reacciones-Rol
CREATE TABLE IF NOT EXISTS reaction_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    type TEXT DEFAULT 'normal' CHECK (type IN ('normal', 'unique', 'temporary', 'required')),
    temp_duration INTEGER, -- Duración en minutos para roles temporales
    required_role_id TEXT, -- Rol requerido para obtener este rol
    max_users INTEGER, -- Límite de usuarios que pueden tener el rol
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reaction_role_users (
    reaction_role_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- Para roles temporales
    PRIMARY KEY (reaction_role_id, user_id),
    FOREIGN KEY (reaction_role_id) REFERENCES reaction_roles(id) ON DELETE CASCADE
);

-- Sistema de Estadísticas
CREATE TABLE IF NOT EXISTS guild_stats (
    guild_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    total_members INTEGER DEFAULT 0,
    online_members INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    commands_used INTEGER DEFAULT 0,
    voice_minutes INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, date)
);

CREATE TABLE IF NOT EXISTS command_stats (
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    uses INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    PRIMARY KEY (guild_id, command_name)
);

CREATE TABLE IF NOT EXISTS channel_stats (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    messages INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, channel_id, date)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_events_guild ON events(guild_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_levels_xp ON levels(guild_id, xp DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_user ON mod_actions(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_type ON mod_actions(guild_id, action_type);
CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON reaction_roles(message_id);
CREATE INDEX IF NOT EXISTS idx_guild_stats_date ON guild_stats(guild_id, date);

-- Vistas útiles
CREATE VIEW IF NOT EXISTS v_active_events AS
SELECT 
    e.*,
    (SELECT COUNT(*) FROM event_participants ep 
     WHERE ep.event_id = e.id AND ep.status = 'registered') as registered_count,
    (SELECT COUNT(*) FROM event_participants ep 
     WHERE ep.event_id = e.id AND ep.status = 'waitlist') as waitlist_count
FROM events e
WHERE e.start_time > CURRENT_TIMESTAMP;

CREATE VIEW IF NOT EXISTS v_level_leaderboard AS
SELECT 
    l.*,
    RANK() OVER (PARTITION BY l.guild_id ORDER BY l.xp DESC) as rank
FROM levels l;

CREATE VIEW IF NOT EXISTS v_mod_stats AS
SELECT 
    guild_id,
    user_id,
    COUNT(*) as total_infractions,
    SUM(CASE WHEN action_type = 'warn' THEN 1 ELSE 0 END) as warnings,
    SUM(CASE WHEN action_type = 'mute' THEN 1 ELSE 0 END) as mutes,
    SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks,
    SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as bans
FROM mod_actions
GROUP BY guild_id, user_id;

CREATE VIEW IF NOT EXISTS v_guild_growth AS
SELECT 
    w.guild_id,
    w.date,
    w.joins,
    w.leaves,
    SUM(w.joins - w.leaves) OVER (
        PARTITION BY w.guild_id 
        ORDER BY w.date
        ROWS UNBOUNDED PRECEDING
    ) as member_count
FROM welcome_stats w; 