# Chat Message Backup & Restore

This guide explains how to export and import chat messages for backup purposes.

## Prerequisites

- Node.js installed locally
- Access to your `DATABASE_URL` (from Railway or your database provider)

## Exporting Messages

To create a backup of all chat messages:

```bash
cd server
DATABASE_URL="your-database-url" npx ts-node src/scripts/export-messages.ts
```

This will:
- Connect to your database
- Export all messages to `server/backups/messages-YYYY-MM-DDTHH-MM-SS.json`
- Display the number of messages exported

### Example Output
```
Connecting to database...

Export complete!
Messages exported: 5432
File saved to: /path/to/server/backups/messages-2026-01-17T14-30-00.json
```

### Backup File Format
```json
{
  "exportedAt": "2026-01-17T14:30:00.000Z",
  "messageCount": 5432,
  "messages": [
    {
      "id": 1,
      "user_id": 5,
      "username": "player1",
      "content": "Hello everyone!",
      "avatar_color": "#00ffff",
      "is_guest": 0,
      "is_deleted": 0,
      "is_edited": 0,
      "reply_to_id": null,
      "created_at": "2026-01-15T10:30:00.000Z"
    }
  ]
}
```

## Importing Messages

To restore messages from a backup file:

```bash
cd server
DATABASE_URL="your-database-url" npx ts-node src/scripts/import-messages.ts backups/messages-2026-01-17T14-30-00.json
```

This will:
- Read the backup file
- Insert messages that don't already exist (by ID)
- Skip duplicates automatically
- Update the ID sequence to prevent conflicts

### Example Output
```
Backup file info:
  Exported at: 2026-01-17T14:30:00.000Z
  Message count: 5432

Connecting to database...
Processed 5432/5432 messages...

Import complete!
Messages imported: 5432
Messages skipped (duplicates): 0
```

## Recommended Backup Schedule

- **Daily**: For active communities
- **Weekly**: For moderate activity
- **Before deployments**: Always backup before major changes

## Notes

- Backup files are stored in `server/backups/` and are gitignored (they contain user data)
- The import script uses `ON CONFLICT DO NOTHING` so it's safe to run multiple times
- Message IDs are preserved to maintain reply relationships
