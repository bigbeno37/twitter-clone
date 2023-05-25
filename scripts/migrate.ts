// Metadata(key: string, value: string, createdAt: Date, updatedAt: Date)
// User(username: string, passwordHash: string)
// UserSession(token: string, username: string, expiry: Date, sessionData: JSON)
// Tweet(id: string, username: string, createdAt: Date, text: string)

import * as dotenv from 'dotenv';
import {Client, QueryResult} from "pg";
dotenv.config();

type Migration = {
    version: string;
    up: (client: Client) => Promise<QueryResult>;
    down: (client: Client) => Promise<QueryResult>;
}

const migrations: Migration[] = [
    {
        version: '1',
        up: (client: Client) => {
            return client.query(`
CREATE TABLE IF NOT EXISTS Account (
    username TEXT PRIMARY KEY,
    passwordHash TEXT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_user_updated_at
BEFORE UPDATE ON Account
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS AccountSession (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES Account(username),
    expiry TIMESTAMP NOT NULL,
    sessionData JSON NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_usersession_updated_at
BEFORE UPDATE ON AccountSession
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS Tweet (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES Account(username),
    text TEXT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_tweet_updated_at
BEFORE UPDATE ON Tweet
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
            `);
        },
        down: (client: Client) => {
            return client.query(`
DROP TABLE IF EXISTS Account;
DROP TABLE IF EXISTS AccountSession;
DROP TABLE IF EXISTS Tweet;
            `);
        }
    }
];

const client = new Client();
client
    .connect()
    .then(() => {
        console.log('Connected to Postgres! Checking for database schema...');

        // Create the Metadata table if it doesn't exist
        return client
            .query(`
CREATE TABLE IF NOT EXISTS Metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedAt = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_metadata_updated_at ON Metadata;

CREATE TRIGGER update_metadata_updated_at
BEFORE UPDATE ON Metadata
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
            `)
    })
    .then(() => {
        // Get the current schema version
        return client
            .query(`SELECT value FROM Metadata WHERE key = 'version';`)
    })
    .then(result => {
        const currentVersion = result.rows[0]?.value ?? '0';

        const index = migrations.findIndex(migration => migration.version === currentVersion);

        if (index === migrations.length - 1) {
            console.log('Already at latest version!');
            return;
        }

        console.log(`Identified current version as ${currentVersion}. Running migrations...`);

        // Get all migrations after index. If index is -1, get all migrations
        const migrationsToRun = index === -1 ? migrations : migrations.slice(index + 1);

        return migrationsToRun.reduce((promise, migration) => {
            return promise.then(() => {
                console.log(`Running migration ${migration.version}...`);
                return migration.up(client).then(() => {
                    return client.query(
                        `INSERT INTO Metadata (key, value) VALUES ('version', $1)`,
                        [migration.version]
                    );
                });
            });
        }, Promise.resolve<any>(null));
    })
    .catch(e => console.log(e))
    .finally(() => {
        console.log('Done! Closing connection to Postgres...');
        return client.end();
    })
    .catch(e => console.log(e));