import Database from 'better-sqlite3';
import { decryptCredentialPayload, generateRandomToken } from '../utils/crypto.ts';
import { assertSafeExternalUrl, safeFetch } from '../utils/ssrf.ts';
import {
  IntegrationConnectionRecord,
  IntegrationDefinition,
} from '../../src/types/workflow.ts';

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    appId: 'slack',
    name: 'Slack',
    category: 'Communication',
    description: 'Post formatted messages to channels via Incoming Webhooks or Slack Bot API tokens.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['Bot Token (xoxb-...) or Incoming Webhook URL'],
    rateLimitNote: '1 message/second per channel burst; Tier 2/3 Web API',
    triggers: [{ id: 'webhook', name: 'Webhook Event', description: 'Receive Slack interactive or event webhook payloads' }],
    actions: [
      {
        id: 'post_message',
        name: 'Post Channel Message',
        description: 'Send a message to a Slack channel using Bot token or Webhook URL.',
        fields: [
          { key: 'channel', label: 'Channel ID or Name', type: 'text', required: false, placeholder: '#general or C012345' },
          { key: 'text', label: 'Message Text', type: 'textarea', required: true, placeholder: 'Deployment succeeded!' },
        ],
        outputPreviewDescription: 'Slack API { ok, ts, channel } response',
      },
    ],
  },
  {
    appId: 'discord',
    name: 'Discord',
    category: 'Communication',
    description: 'Send rich text notifications to Discord channels via Webhook URLs.',
    availability: 'requires_credentials',
    authType: 'webhook_url',
    requiredCredentials: ['Discord Channel Webhook URL stored as Credential'],
    rateLimitNote: '5 requests / 2 seconds per webhook',
    triggers: [],
    actions: [
      {
        id: 'send_webhook_message',
        name: 'Send Channel Message',
        description: 'Post a message to a Discord webhook channel.',
        fields: [
          { key: 'username', label: 'Bot Display Name', type: 'text', required: false, placeholder: 'CROX Bot' },
          { key: 'content', label: 'Message Content', type: 'textarea', required: true, placeholder: 'New alert received.' },
        ],
        outputPreviewDescription: 'HTTP delivery status and response metadata',
      },
    ],
  },
  {
    appId: 'telegram',
    name: 'Telegram',
    category: 'Communication',
    description: 'Dispatch messages to Telegram chats and groups through the Telegram Bot API.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['Telegram Bot Token (from @BotFather)'],
    rateLimitNote: '30 messages/second overall; 1 message/sec per chat',
    triggers: [{ id: 'bot_webhook', name: 'Bot Update Webhook', description: 'Receive incoming Telegram updates via CROX webhook' }],
    actions: [
      {
        id: 'send_message',
        name: 'Send Telegram Message',
        description: 'Call sendMessage on api.telegram.org.',
        fields: [
          { key: 'chatId', label: 'Chat ID', type: 'text', required: true, placeholder: '123456789' },
          { key: 'text', label: 'Message Text', type: 'textarea', required: true, placeholder: 'Workflow alert...' },
        ],
        outputPreviewDescription: 'Telegram message object { ok, result.message_id }',
      },
    ],
  },
  {
    appId: 'github',
    name: 'GitHub',
    category: 'Development',
    description: 'Create issues, fetch repository metadata, and inspect pull requests via GitHub REST API v3.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['GitHub Personal Access Token (Fine-grained or Classic)'],
    rateLimitNote: '5,000 requests/hour authenticated',
    triggers: [{ id: 'repo_webhook', name: 'Repository Webhook', description: 'Receive push, PR, and issue events' }],
    actions: [
      {
        id: 'get_repo',
        name: 'Get Repository Info',
        description: 'Fetch repository details from GitHub.',
        fields: [{ key: 'repo', label: 'Repository (owner/name)', type: 'text', required: true, placeholder: 'vercel/next.js' }],
        outputPreviewDescription: 'Repository stars, default branch, open issues, and license',
      },
      {
        id: 'create_issue',
        name: 'Create Issue',
        description: 'Open a new issue in a GitHub repository.',
        fields: [
          { key: 'repo', label: 'Repository (owner/name)', type: 'text', required: true, placeholder: 'acme/platform' },
          { key: 'title', label: 'Issue Title', type: 'text', required: true, placeholder: 'Bug report' },
          { key: 'body', label: 'Issue Body', type: 'textarea', required: false, placeholder: 'Details...' },
        ],
        outputPreviewDescription: 'Created GitHub issue URL, number, and state',
      },
    ],
  },
  {
    appId: 'notion',
    name: 'Notion',
    category: 'Productivity',
    description: 'Create database pages and query Notion workspaces via Notion API 2022-06-28.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['Notion Internal Integration Secret (secret_... or ntn_...)'],
    rateLimitNote: '3 requests/second average',
    triggers: [],
    actions: [
      {
        id: 'query_database',
        name: 'Query Database',
        description: 'Fetch pages from a shared Notion database.',
        fields: [{ key: 'databaseId', label: 'Database ID', type: 'text', required: true, placeholder: '32-char UUID' }],
        outputPreviewDescription: 'Notion query results array',
      },
      {
        id: 'create_page',
        name: 'Create Database Page',
        description: 'Insert a titled item into a Notion database.',
        fields: [
          { key: 'databaseId', label: 'Database ID', type: 'text', required: true, placeholder: '32-char UUID' },
          { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'New Task' },
        ],
        outputPreviewDescription: 'Created Notion page ID and URL',
      },
    ],
  },
  {
    appId: 'airtable',
    name: 'Airtable',
    category: 'Productivity',
    description: 'List and create records in Airtable bases using Personal Access Tokens.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['Airtable Personal Access Token (pat...)'],
    rateLimitNote: '5 requests/second per base',
    triggers: [],
    actions: [
      {
        id: 'list_records',
        name: 'List Records',
        description: 'Fetch records from an Airtable table.',
        fields: [
          { key: 'baseId', label: 'Base ID', type: 'text', required: true, placeholder: 'appXXXXXXXX' },
          { key: 'tableName', label: 'Table Name or ID', type: 'text', required: true, placeholder: 'Leads' },
        ],
        outputPreviewDescription: 'Airtable records list',
      },
      {
        id: 'create_record',
        name: 'Create Record',
        description: 'Insert a JSON fields object into an Airtable table.',
        fields: [
          { key: 'baseId', label: 'Base ID', type: 'text', required: true, placeholder: 'appXXXXXXXX' },
          { key: 'tableName', label: 'Table Name or ID', type: 'text', required: true, placeholder: 'Leads' },
          { key: 'fieldsJson', label: 'Fields JSON', type: 'json', required: true, placeholder: '{"Name": "Ada"}' },
        ],
        outputPreviewDescription: 'Created Airtable record ID & fields',
      },
    ],
  },
  {
    appId: 'linear',
    name: 'Linear',
    category: 'Productivity',
    description: 'Create and list engineering issues via Linear GraphQL API.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['Linear Personal API Key (lin_api_...)'],
    rateLimitNote: '1,500 requests/hour',
    triggers: [],
    actions: [
      {
        id: 'list_issues',
        name: 'List Recent Issues',
        description: 'Fetch recent Linear issues for the authenticated workspace.',
        fields: [],
        outputPreviewDescription: 'Linear issues list (identifier, title, state)',
      },
      {
        id: 'create_issue',
        name: 'Create Issue',
        description: 'Create a Linear issue in a Team ID.',
        fields: [
          { key: 'teamId', label: 'Team ID', type: 'text', required: true, placeholder: 'Team UUID' },
          { key: 'title', label: 'Issue Title', type: 'text', required: true, placeholder: 'Fix webhook retry' },
          { key: 'description', label: 'Description', type: 'textarea', required: false, placeholder: 'Context...' },
        ],
        outputPreviewDescription: 'Created Linear issue identifier and URL',
      },
    ],
  },
  {
    appId: 'hubspot',
    name: 'HubSpot',
    category: 'Business',
    description: 'Create and search CRM contacts using HubSpot Private App access tokens.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['HubSpot Private App Token (pat-...)'],
    rateLimitNote: '100 requests / 10 seconds',
    triggers: [],
    actions: [
      {
        id: 'create_contact',
        name: 'Create Contact',
        description: 'Add a contact record in HubSpot CRM v3.',
        fields: [
          { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'alex@company.com' },
          { key: 'firstname', label: 'First Name', type: 'text', required: false, placeholder: 'Alex' },
          { key: 'lastname', label: 'Last Name', type: 'text', required: false, placeholder: 'Rivera' },
        ],
        outputPreviewDescription: 'HubSpot CRM contact object with ID',
      },
    ],
  },
  {
    appId: 'stripe',
    name: 'Stripe',
    category: 'Business',
    description: 'Inspect customers and payment events via the Stripe REST API.',
    availability: 'requires_credentials',
    authType: 'api_key',
    requiredCredentials: ['Stripe Restricted or Secret API Key (rk_... / sk_...)'],
    rateLimitNote: '100 read/write requests/sec',
    triggers: [{ id: 'stripe_webhook', name: 'Stripe Webhook', description: 'Trigger on Stripe invoice/payment webhook events' }],
    actions: [
      {
        id: 'list_customers',
        name: 'List Customers',
        description: 'Fetch latest customers from Stripe.',
        fields: [{ key: 'limit', label: 'Limit', type: 'text', required: false, placeholder: '10' }],
        outputPreviewDescription: 'Stripe customer list response',
      },
    ],
  },
  {
    appId: 'generic_http',
    name: 'Generic HTTP / REST API',
    category: 'Generic',
    description: 'Connect any REST or GraphQL API with SSRF protection and encrypted HTTP Auth credentials.',
    availability: 'available',
    authType: 'http_auth',
    requiredCredentials: ['Optional HTTP Auth or API Key credential'],
    rateLimitNote: 'Governed by destination API',
    triggers: [{ id: 'webhook', name: 'Webhook Trigger', description: 'Generic inbound HTTPS JSON endpoint' }],
    actions: [
      {
        id: 'request',
        name: 'Execute HTTP Request',
        description: 'Send a GET/POST/PUT/DELETE request to an external URL.',
        fields: [
          { key: 'method', label: 'Method', type: 'select', required: true, options: [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
            { label: 'DELETE', value: 'DELETE' },
          ] },
          { key: 'url', label: 'Destination URL', type: 'text', required: true, placeholder: 'https://api.example.com/v1/resource' },
          { key: 'body', label: 'JSON Body', type: 'json', required: false, placeholder: '{}' },
        ],
        outputPreviewDescription: 'Status code, headers, and parsed JSON body',
      },
    ],
  },
  {
    appId: 'gmail',
    name: 'Gmail (Google Workspace)',
    category: 'Google',
    description: 'Read and send Gmail messages via OAuth 2.0 (Use SMTP / HTTP Request until Google OAuth is provisioned).',
    availability: 'coming_soon',
    authType: 'oauth2',
    requiredCredentials: ['Google Workspace OAuth 2.0 Client'],
    oauthScopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    rateLimitNote: '250 quota units/user/second',
    triggers: [],
    actions: [],
  },
  {
    appId: 'google_sheets',
    name: 'Google Sheets',
    category: 'Google',
    description: 'Read and append spreadsheet rows via Google Workspace OAuth 2.0.',
    availability: 'coming_soon',
    authType: 'oauth2',
    requiredCredentials: ['Google Workspace OAuth 2.0 Client'],
    oauthScopes: ['https://www.googleapis.com/auth/spreadsheets'],
    rateLimitNote: '60 requests/minute/user',
    triggers: [],
    actions: [],
  },
  {
    appId: 'google_drive',
    name: 'Google Drive',
    category: 'Google',
    description: 'List, upload, and share Drive files via Google Workspace OAuth 2.0.',
    availability: 'coming_soon',
    authType: 'oauth2',
    requiredCredentials: ['Google Workspace OAuth 2.0 Client'],
    oauthScopes: ['https://www.googleapis.com/auth/drive.file'],
    rateLimitNote: '12,000 queries/minute',
    triggers: [],
    actions: [],
  },
  {
    appId: 'google_calendar',
    name: 'Google Calendar',
    category: 'Google',
    description: 'Schedule events and inspect calendars via Google Workspace OAuth 2.0.',
    availability: 'coming_soon',
    authType: 'oauth2',
    requiredCredentials: ['Google Workspace OAuth 2.0 Client'],
    oauthScopes: ['https://www.googleapis.com/auth/calendar.events'],
    rateLimitNote: '500 queries/100 seconds',
    triggers: [],
    actions: [],
  },
  {
    appId: 'trello',
    name: 'Trello',
    category: 'Productivity',
    description: 'Manage Trello boards and cards (dedicated adapter coming soon — available via Generic HTTP).',
    availability: 'coming_soon',
    authType: 'api_key',
    requiredCredentials: ['Trello API Key & Token'],
    rateLimitNote: '100 requests / 10 seconds',
    triggers: [],
    actions: [],
  },
  {
    appId: 'asana',
    name: 'Asana',
    category: 'Productivity',
    description: 'Automate Asana tasks and projects (dedicated adapter coming soon — available via Generic HTTP).',
    availability: 'coming_soon',
    authType: 'oauth2',
    requiredCredentials: ['Asana Personal Access Token or OAuth2'],
    rateLimitNote: '1,500 requests/minute',
    triggers: [],
    actions: [],
  },
  {
    appId: 'shopify',
    name: 'Shopify',
    category: 'Business',
    description: 'Sync Shopify orders and inventory (dedicated adapter coming soon — available via Generic HTTP).',
    availability: 'coming_soon',
    authType: 'api_key',
    requiredCredentials: ['Shopify Admin API Access Token'],
    rateLimitNote: '40-point leaky bucket',
    triggers: [],
    actions: [],
  },
  {
    appId: 'woocommerce',
    name: 'WooCommerce',
    category: 'Business',
    description: 'Connect WooCommerce store orders (dedicated adapter coming soon — available via Generic HTTP).',
    availability: 'coming_soon',
    authType: 'api_key',
    requiredCredentials: ['WooCommerce Consumer Key & Secret'],
    rateLimitNote: 'Host-dependent',
    triggers: [],
    actions: [],
  },
  {
    appId: 'wordpress',
    name: 'WordPress',
    category: 'Business',
    description: 'Publish WordPress posts via REST API (dedicated adapter coming soon — available via Generic HTTP).',
    availability: 'coming_soon',
    authType: 'http_auth',
    requiredCredentials: ['WordPress Application Password'],
    rateLimitNote: 'Host-dependent',
    triggers: [],
    actions: [],
  },
];

function mapConnectionRow(row: Record<string, unknown>): IntegrationConnectionRecord {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse((row.config_json as string) || '{}');
  } catch {
    config = {};
  }
  return {
    id: row.id as string,
    userId: row.user_id as string,
    appId: row.app_id as string,
    label: row.label as string,
    authType: row.auth_type as string,
    credentialId: (row.credential_id as string | null) ?? null,
    credentialLabel: (row.credential_label as string | undefined) || undefined,
    status: (row.status as IntegrationConnectionRecord['status']) || 'disconnected',
    config,
    lastTestedAt: (row.last_tested_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listIntegrationsForUser(db: Database.Database, userId: string): IntegrationDefinition[] {
  const conns = db
    .prepare('SELECT app_id, status FROM integration_connections WHERE user_id = ?')
    .all(userId) as Array<{ app_id: string; status: string }>;

  return INTEGRATION_CATALOG.map((def) => {
    const appConns = conns.filter((c) => c.app_id === def.appId);
    const hasConnected = appConns.some((c) => c.status === 'connected');
    const hasError = appConns.some((c) => c.status === 'error');
    return {
      ...def,
      connectedCount: appConns.length,
      connectionStatus: hasConnected ? 'connected' : hasError ? 'error' : 'disconnected',
    };
  });
}

export function listConnectionsForUser(db: Database.Database, userId: string): IntegrationConnectionRecord[] {
  const rows = db
    .prepare(
      `SELECT ic.*, c.label as credential_label
       FROM integration_connections ic
       LEFT JOIN credentials c ON c.id = ic.credential_id AND c.user_id = ic.user_id
       WHERE ic.user_id = ?
       ORDER BY ic.updated_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map(mapConnectionRow);
}

export function createIntegrationConnection(
  db: Database.Database,
  userId: string,
  appId: string,
  input: { label: string; credentialId?: string | null; config?: Record<string, string> }
): IntegrationConnectionRecord {
  const def = INTEGRATION_CATALOG.find((d) => d.appId === appId);
  if (!def) throw new Error(`Unknown integration "${appId}".`);
  if (def.availability === 'coming_soon') {
    throw new Error(`${def.name} connector is marked Coming Soon and cannot be connected yet. Use Generic HTTP / REST API instead.`);
  }

  const label = input.label.trim() || `${def.name} Connection`;
  let credId: string | null = input.credentialId ? String(input.credentialId).trim() : null;
  if (credId) {
    const cred = db
      .prepare('SELECT id FROM credentials WHERE id = ? AND user_id = ?')
      .get(credId, userId);
    if (!cred) throw new Error('Selected credential was not found.');
  } else if (def.availability === 'requires_credentials') {
    throw new Error(`${def.name} requires selecting an encrypted credential.`);
  }

  const id = `intc_${generateRandomToken(8)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO integration_connections
       (id, user_id, app_id, label, auth_type, credential_id, status, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'disconnected', ?, ?, ?)`
  ).run(id, userId, appId, label, def.authType, credId, JSON.stringify(input.config || {}), now, now);

  const row = db
    .prepare(
      `SELECT ic.*, c.label as credential_label
       FROM integration_connections ic
       LEFT JOIN credentials c ON c.id = ic.credential_id
       WHERE ic.id = ?`
    )
    .get(id) as Record<string, unknown>;
  return mapConnectionRow(row);
}

function getDecryptedSecret(db: Database.Database, userId: string, credentialId: string): string {
  const row = db
    .prepare('SELECT * FROM credentials WHERE id = ? AND user_id = ?')
    .get(credentialId, userId) as
    | { encrypted_payload: string; iv: string; auth_tag: string; is_enabled?: number }
    | undefined;
  if (!row) throw new Error('Referenced credential was not found.');
  if (row.is_enabled === 0) throw new Error('Referenced credential is currently disabled.');
  return decryptCredentialPayload(row.encrypted_payload, row.iv, row.auth_tag);
}

export async function testIntegrationConnection(
  db: Database.Database,
  userId: string,
  connectionId: string
): Promise<{ ok: boolean; message: string; connection: IntegrationConnectionRecord }> {
  const row = db
    .prepare('SELECT * FROM integration_connections WHERE id = ? AND user_id = ?')
    .get(connectionId, userId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Integration connection not found.');

  const appId = row.app_id as string;
  const credId = row.credential_id as string | null;
  const now = new Date().toISOString();

  try {
    const secret = credId ? getDecryptedSecret(db, userId, credId) : '';
    let message = 'Verified cleanly.';

    if (appId === 'github') {
      await assertSafeExternalUrl('https://api.github.com/user');
      const r = await safeFetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'CROX-Automation' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`GitHub auth check failed (${r.status}).`);
      const data = (await r.json()) as { login?: string };
      message = `Authenticated as @${data.login || 'github-user'}`;
    } else if (appId === 'slack') {
      if (secret.startsWith('https://')) {
        await assertSafeExternalUrl(secret);
        message = 'Slack webhook URL validated.';
      } else {
        await assertSafeExternalUrl('https://slack.com/api/auth.test');
        const r = await safeFetch('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(10000),
        });
        const data = (await r.json()) as { ok?: boolean; team?: string; error?: string };
        if (!r.ok || !data.ok) throw new Error(`Slack auth.test failed: ${data.error || r.status}`);
        message = `Connected to Slack workspace ${data.team || ''}`;
      }
    } else if (appId === 'discord') {
      await assertSafeExternalUrl(secret);
      const r = await safeFetch(secret, { method: 'GET', signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`Discord webhook verification failed (${r.status}).`);
      message = 'Discord webhook verified.';
    } else if (appId === 'telegram') {
      const url = `https://api.telegram.org/bot${encodeURIComponent(secret)}/getMe`;
      await assertSafeExternalUrl(url);
      const r = await safeFetch(url, { signal: AbortSignal.timeout(10000) });
      const data = (await r.json()) as { ok?: boolean; result?: { username?: string }; description?: string };
      if (!r.ok || !data.ok) throw new Error(`Telegram getMe failed: ${data.description || r.status}`);
      message = `Connected to Telegram bot @${data.result?.username || 'bot'}`;
    } else if (appId === 'notion') {
      await assertSafeExternalUrl('https://api.notion.com/v1/users/me');
      const r = await safeFetch('https://api.notion.com/v1/users/me', {
        headers: { Authorization: `Bearer ${secret}`, 'Notion-Version': '2022-06-28' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`Notion verification failed (${r.status}).`);
      message = 'Notion integration token verified.';
    } else if (appId === 'airtable') {
      await assertSafeExternalUrl('https://api.airtable.com/v0/meta/whoami');
      const r = await safeFetch('https://api.airtable.com/v0/meta/whoami', {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`Airtable verification failed (${r.status}).`);
      message = 'Airtable PAT verified.';
    } else if (appId === 'linear') {
      await assertSafeExternalUrl('https://api.linear.app/graphql');
      const r = await safeFetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { id name } }' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`Linear verification failed (${r.status}).`);
      message = 'Linear API key verified.';
    } else if (appId === 'stripe') {
      await assertSafeExternalUrl('https://api.stripe.com/v1/customers?limit=1');
      const r = await safeFetch('https://api.stripe.com/v1/customers?limit=1', {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`Stripe verification failed (${r.status}).`);
      message = 'Stripe API key verified.';
    } else if (appId === 'hubspot') {
      await assertSafeExternalUrl('https://api.hubapi.com/crm/v3/objects/contacts?limit=1');
      const r = await safeFetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`HubSpot verification failed (${r.status}).`);
      message = 'HubSpot Private App token verified.';
    }

    db.prepare(
      `UPDATE integration_connections
       SET status = 'connected', last_tested_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(now, now, connectionId, userId);

    const updated = listConnectionsForUser(db, userId).find((c) => c.id === connectionId)!;
    return { ok: true, message, connection: updated };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Connection test failed.';
    db.prepare(
      `UPDATE integration_connections
       SET status = 'error', last_tested_at = ?, last_error = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(now, errMsg, now, connectionId, userId);
    throw new Error(errMsg);
  }
}

export async function executeIntegrationAction(params: {
  db: Database.Database;
  userId: string;
  appId: string;
  actionId: string;
  credentialId: string;
  resolvedParams: Record<string, string>;
}): Promise<{ output: unknown; simulated: boolean }> {
  const def = INTEGRATION_CATALOG.find((d) => d.appId === params.appId);
  if (!def) throw new Error(`Unknown integration "${params.appId}".`);
  if (def.availability === 'coming_soon') {
    throw new Error(`${def.name} connector is Coming Soon and not yet executable directly. Use HTTP Request node instead.`);
  }

  const secret = params.credentialId ? getDecryptedSecret(params.db, params.userId, params.credentialId) : '';
  if (def.availability === 'requires_credentials' && !secret) {
    throw new Error(`${def.name} requires an active credential configured on this node.`);
  }

  const p = params.resolvedParams;

  if (params.appId === 'slack' && params.actionId === 'post_message') {
    if (secret.startsWith('https://')) {
      await assertSafeExternalUrl(secret);
      const r = await safeFetch(secret, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: p.text || '' }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error(`Slack webhook returned HTTP ${r.status}`);
      return { output: { ok: true, delivery: 'webhook', status: r.status }, simulated: false };
    }
    await assertSafeExternalUrl('https://slack.com/api/chat.postMessage');
    const r = await safeFetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: p.channel || '#general', text: p.text || '' }),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !data.ok) throw new Error(`Slack postMessage error: ${data.error || r.status}`);
    return { output: data, simulated: false };
  }

  if (params.appId === 'discord' && params.actionId === 'send_webhook_message') {
    await assertSafeExternalUrl(secret);
    const r = await safeFetch(secret, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: p.content || '', username: p.username || 'CROX' }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`Discord webhook returned HTTP ${r.status}`);
    return { output: { ok: true, status: r.status }, simulated: false };
  }

  if (params.appId === 'telegram' && params.actionId === 'send_message') {
    const url = `https://api.telegram.org/bot${encodeURIComponent(secret)}/sendMessage`;
    await assertSafeExternalUrl(url);
    const r = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: p.chatId, text: p.text || '' }),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await r.json()) as { ok?: boolean; description?: string };
    if (!r.ok || !data.ok) throw new Error(`Telegram sendMessage failed: ${data.description || r.status}`);
    return { output: data, simulated: false };
  }

  if (params.appId === 'github') {
    const repo = (p.repo || '').trim();
    if (!repo.includes('/')) throw new Error('GitHub repository must be in "owner/name" format.');
    if (params.actionId === 'get_repo') {
      const url = `https://api.github.com/repos/${repo}`;
      await assertSafeExternalUrl(url);
      const r = await safeFetch(url, {
        headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'CROX-Automation' },
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`GitHub get_repo failed (${r.status})`);
      return { output: data, simulated: false };
    }
    if (params.actionId === 'create_issue') {
      const url = `https://api.github.com/repos/${repo}/issues`;
      await assertSafeExternalUrl(url);
      const r = await safeFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'User-Agent': 'CROX-Automation',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: p.title, body: p.body || '' }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`GitHub create_issue failed (${r.status})`);
      return { output: data, simulated: false };
    }
  }

  if (params.appId === 'notion') {
    if (params.actionId === 'query_database') {
      const url = `https://api.notion.com/v1/databases/${encodeURIComponent(p.databaseId || '')}/query`;
      await assertSafeExternalUrl(url);
      const r = await safeFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_size: 20 }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`Notion query failed (${r.status})`);
      return { output: data, simulated: false };
    }
    if (params.actionId === 'create_page') {
      await assertSafeExternalUrl('https://api.notion.com/v1/pages');
      const r = await safeFetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: p.databaseId },
          properties: { Name: { title: [{ text: { content: p.title || 'CROX Item' } }] } },
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`Notion create_page failed (${r.status})`);
      return { output: data, simulated: false };
    }
  }

  if (params.appId === 'airtable') {
    const url = `https://api.airtable.com/v0/${encodeURIComponent(p.baseId || '')}/${encodeURIComponent(
      p.tableName || ''
    )}`;
    await assertSafeExternalUrl(url);
    if (params.actionId === 'list_records') {
      const r = await safeFetch(`${url}?maxRecords=20`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`Airtable list_records failed (${r.status})`);
      return { output: data, simulated: false };
    }
    if (params.actionId === 'create_record') {
      const fields = JSON.parse(p.fieldsJson || '{}');
      const r = await safeFetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`Airtable create_record failed (${r.status})`);
      return { output: data, simulated: false };
    }
  }

  if (params.appId === 'linear') {
    await assertSafeExternalUrl('https://api.linear.app/graphql');
    const query =
      params.actionId === 'create_issue'
        ? {
            query:
              'mutation ($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }',
            variables: { input: { teamId: p.teamId, title: p.title, description: p.description || '' } },
          }
        : { query: '{ issues(first: 15) { nodes { id identifier title state { name } url } } }' };

    const r = await safeFetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: secret, 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`Linear API failed (${r.status})`);
    return { output: data, simulated: false };
  }

  if (params.appId === 'hubspot' && params.actionId === 'create_contact') {
    await assertSafeExternalUrl('https://api.hubapi.com/crm/v3/objects/contacts');
    const r = await safeFetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { email: p.email, firstname: p.firstname || '', lastname: p.lastname || '' },
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`HubSpot create_contact failed (${r.status})`);
    return { output: data, simulated: false };
  }

  if (params.appId === 'stripe' && params.actionId === 'list_customers') {
    const limit = Math.min(50, Math.max(1, Number(p.limit || 10)));
    const url = `https://api.stripe.com/v1/customers?limit=${limit}`;
    await assertSafeExternalUrl(url);
    const r = await safeFetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`Stripe list_customers failed (${r.status})`);
    return { output: data, simulated: false };
  }

  if (params.appId === 'generic_http') {
    const targetUrl = (p.url || '').trim();
    if (!targetUrl) throw new Error('Generic HTTP integration requires a target URL.');
    await assertSafeExternalUrl(targetUrl);
    const method = (p.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    if (secret) {
      headers.Authorization = secret.startsWith('Bearer ') || secret.startsWith('Basic ') ? secret : `Bearer ${secret}`;
    }
    if (method !== 'GET' && p.body) headers['Content-Type'] = 'application/json';
    const r = await safeFetch(targetUrl, {
      method,
      headers,
      body: method !== 'GET' && p.body ? p.body : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    return { output: { status: r.status, data: parsed }, simulated: false };
  }

  throw new Error(`Unsupported action "${params.actionId}" for integration "${params.appId}".`);
}
