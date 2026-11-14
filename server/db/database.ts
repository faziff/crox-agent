import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.ts';
import { generateRandomToken } from '../utils/crypto.ts';

let dbInstance: Database.Database | null = null;

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === columnName);
}

const migrations: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          avatar_url TEXT,
          timezone TEXT NOT NULL DEFAULT 'UTC',
          theme TEXT NOT NULL DEFAULT 'dark',
          notifications_enabled INTEGER NOT NULL DEFAULT 1,
          plan TEXT NOT NULL DEFAULT 'free',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          user_agent TEXT NOT NULL DEFAULT '',
          ip_address TEXT NOT NULL DEFAULT '',
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);

        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 0,
          nodes_json TEXT NOT NULL,
          edges_json TEXT NOT NULL,
          settings_json TEXT NOT NULL,
          webhook_secret TEXT NOT NULL,
          last_execution_status TEXT,
          last_executed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
        CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);

        CREATE TABLE IF NOT EXISTS workflow_executions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          trigger_type TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          summary_json TEXT NOT NULL,
          error_message TEXT,
          FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_executions_user_id ON workflow_executions(user_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON workflow_executions(workflow_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS node_executions (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          node_name TEXT NOT NULL,
          node_type TEXT NOT NULL,
          status TEXT NOT NULL,
          input_json TEXT,
          output_json TEXT,
          error_message TEXT,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          simulated INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_node_executions_exec_id ON node_executions(execution_id);

        CREATE TABLE IF NOT EXISTS credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          label TEXT NOT NULL,
          type TEXT NOT NULL,
          encrypted_payload TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          masked_preview TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);

        CREATE TABLE IF NOT EXISTS scheduled_jobs (
          workflow_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          timezone TEXT NOT NULL DEFAULT 'UTC',
          next_run_at TEXT NOT NULL,
          last_run_at TEXT,
          locked_until TEXT,
          FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);
      `);
    },
  },
  {
    version: 2,
    name: '002_workflow_evaluations',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_evaluations (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          checks_json TEXT NOT NULL,
          execution_id TEXT,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_evaluations_workflow_id ON workflow_evaluations(workflow_id, created_at DESC);
      `);
    },
  },
  {
    version: 3,
    name: '003_projects_versions_ai_memory',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          workspace_name TEXT NOT NULL DEFAULT 'Personal',
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          is_default INTEGER NOT NULL DEFAULT 0,
          is_archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

        CREATE TABLE IF NOT EXISTS workflow_versions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          nodes_json TEXT NOT NULL,
          edges_json TEXT NOT NULL,
          settings_json TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workflow_versions_wf_id ON workflow_versions(workflow_id, version_number DESC);

        CREATE TABLE IF NOT EXISTS ai_memory_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          workflow_id TEXT,
          session_key TEXT NOT NULL,
          conversation_id TEXT NOT NULL DEFAULT 'default',
          messages_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_mem_user_session
          ON ai_memory_sessions(user_id, session_key, conversation_id);
      `);

      if (!hasColumn(db, 'workflows', 'project_id')) {
        db.exec(`ALTER TABLE workflows ADD COLUMN project_id TEXT`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workflows_project_id ON workflows(project_id)`);

      // Backfill default Personal project for all existing users and assign orphan workflows
      const existingUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
      const now = new Date().toISOString();
      const findDefault = db.prepare(
        'SELECT id FROM projects WHERE user_id = ? AND is_default = 1 LIMIT 1'
      );
      const insertProject = db.prepare(
        `INSERT INTO projects (id, user_id, workspace_name, name, description, is_default, is_archived, created_at, updated_at)
         VALUES (?, ?, 'Personal', 'Personal', 'Default workspace project for your automations.', 1, 0, ?, ?)`
      );
      const backfillWorkflows = db.prepare(
        'UPDATE workflows SET project_id = ? WHERE user_id = ? AND (project_id IS NULL OR project_id = \'\')'
      );

      for (const user of existingUsers) {
        let proj = findDefault.get(user.id) as { id: string } | undefined;
        if (!proj) {
          const projId = `prj_${generateRandomToken(8)}`;
          insertProject.run(projId, user.id, now, now);
          proj = { id: projId };
        }
        backfillWorkflows.run(proj.id, user.id);
      }
    },
  },
  {
    version: 4,
    name: '004_providers_integrations_credentials',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_provider_configs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          base_url TEXT NOT NULL DEFAULT '',
          default_model TEXT NOT NULL DEFAULT '',
          backup_provider_id TEXT NOT NULL DEFAULT '',
          is_primary INTEGER NOT NULL DEFAULT 0,
          is_enabled INTEGER NOT NULL DEFAULT 1,
          discovered_models_json TEXT NOT NULL DEFAULT '[]',
          capabilities_json TEXT NOT NULL DEFAULT '{}',
          health_status TEXT NOT NULL DEFAULT 'untested',
          last_error TEXT,
          last_tested_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_cfg_user_prov
          ON ai_provider_configs(user_id, provider_id);

        CREATE TABLE IF NOT EXISTS ai_provider_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          label TEXT NOT NULL,
          encrypted_payload TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          masked_preview TEXT NOT NULL,
          is_primary INTEGER NOT NULL DEFAULT 0,
          is_enabled INTEGER NOT NULL DEFAULT 1,
          project_tag TEXT NOT NULL DEFAULT '',
          health_status TEXT NOT NULL DEFAULT 'untested',
          last_success_at TEXT,
          last_error TEXT,
          last_used_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_user_prov
          ON ai_provider_keys(user_id, provider_id);

        CREATE TABLE IF NOT EXISTS integration_connections (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          label TEXT NOT NULL,
          auth_type TEXT NOT NULL,
          credential_id TEXT,
          status TEXT NOT NULL DEFAULT 'disconnected',
          config_json TEXT NOT NULL DEFAULT '{}',
          last_tested_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_integration_conn_user_app
          ON integration_connections(user_id, app_id);
      `);

      if (!hasColumn(db, 'credentials', 'is_enabled')) {
        db.exec(`ALTER TABLE credentials ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1`);
      }
      if (!hasColumn(db, 'credentials', 'provider_meta')) {
        db.exec(`ALTER TABLE credentials ADD COLUMN provider_meta TEXT NOT NULL DEFAULT '{}'`);
      }
    },
  },
  {
    version: 5,
    name: '005_dark_first_theme_default',
    up: (db) => {
      // The previous application defaulted every new account to light mode.
      // Normalize that historical default to CROX's new dark-first appearance.
      // Users can still explicitly choose light mode later in Settings.
      db.prepare("UPDATE users SET theme = 'dark' WHERE theme IS NULL OR theme = '' OR theme = 'light'").run();
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      const tx = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          migration.version,
          migration.name,
          new Date().toISOString()
        );
      });
      tx();
    }
  }
}

export function initDatabase(customPath?: string): Database.Database {
  if (dbInstance && !customPath) return dbInstance;

  const targetPath = customPath || config.dbPath;
  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  db.pragma('foreign_keys = ON');
  if (targetPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  runMigrations(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}
