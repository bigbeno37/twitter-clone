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
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_usersession_updated_at
BEFORE UPDATE ON AccountSession
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS Tweet (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT NOT NULL REFERENCES Account(username),
    text TEXT NOT NULL,
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_tweet_updated_at
BEFORE UPDATE ON Tweet
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
            `);
        },
        down: (client: Client) => {
            return client.query(`
DROP TABLE IF EXISTS Account CASCADE;
DROP TABLE IF EXISTS AccountSession CASCADE;
DROP TABLE IF EXISTS Tweet CASCADE;
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
  createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
        // Fetch command line arguments
        const args = process.argv.slice(2);
        const revert = args.includes('revert');

        const currentVersion = result.rows[0]?.value ?? '0';

        const index = migrations.findIndex(migration => migration.version === currentVersion);

        if (revert) {
            if (index === -1) {
                console.log('No migrations to revert!');
                return;
            }

            console.log(`Identified current version as ${currentVersion}. Reverting migrations...`);

            // Get all migrations before index
            const migrationsToRevert = migrations.slice(0, index + 1).reverse();

            return migrationsToRevert.reduce((promise, migration) => {
                return promise.then(() => {
                    console.log(`Reverting migration ${migration.version}...`);
                    return migration.down(client).then(() => {
                        return client.query(
                            `INSERT INTO Metadata (key, value) VALUES ('version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                            // TODO: This is totally gonna throw someday. I should probably handle errors.
                            [parseInt(migration.version)-1]
                        );
                    });
                });
            }, Promise.resolve<any>(null));
        } else {
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
                            `INSERT INTO Metadata (key, value) VALUES ('version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                            [migration.version]
                        );
                    });
                });
            }, Promise.resolve<any>(null));
        }
    })
    .catch(e => console.log(e))
    .finally(() => {
        console.log('Done! Closing connection to Postgres...');
        return client.end();
    })
    .catch(e => console.log(e));