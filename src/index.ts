import * as dotenv from 'dotenv';
dotenv.config();

import "@total-typescript/ts-reset";

import express, {RequestHandler} from 'express';
import {add, compareDesc, format, isPast} from 'date-fns';
import * as argon2 from "argon2";
import {nanoid} from "nanoid";
import cookieParser from "cookie-parser";
import type {Response} from "express";
import {Client} from 'pg';

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

declare global {
    namespace Express {
        interface Request {
            session?: {
                username: string;

                sessionData: Record<string, any>;
            };
        }
    }
}

// TODO: Check if I can use top level await. This works for now.
(async () => {
    const client = new Client();
    await client.connect();

    const app = express();

    // Set EJS as the view engine
    app.set('view engine', 'ejs');

    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use('/static', express.static('static'));

    const requestIsAuthenticated = (req: express.Request) => {
        return !!req.session?.username;
    };

    app.use((req, res, next) => {
        res.locals['format'] = format;

        next();
    });

// ============= PUBLIC ROUTES =============

    const clearAuthToken = (res: Response) => {
        res.clearCookie('authToken');
    };

    app.use((req, res, next) => {
        const authToken = req.cookies?.authToken;
        if (!authToken) {
            return next();
        }

        client
            .query<{ username: string, sessionData: Record<string, any>, expiry: Date }>('SELECT username, sessionData, expiry FROM AccountSession WHERE token = $1', [authToken])
            .then(result => {
                const session = result.rows[0] ?? null;
                if (!session) {
                    clearAuthToken(res);
                    return next();
                }

                const expiry = session.expiry;
                if (isPast(expiry)) {
                    clearAuthToken(res);
                    return next();
                }

                req.session = session;
                res.locals['session'] = req.session;

                next();
            })
            .catch(console.error);
    });

    const getSortedTweets = () => {
        return client
            .query<{ username: string, text: string, createdat: Date }>('SELECT username, text, createdAt FROM Tweet ORDER BY createdAt DESC')
            .then(result => result.rows);
    };

    app.get('/', (req, res) => {
        getSortedTweets().then(tweets => {
            res.render('index', { tweets });
        });
    });

// ================== AUTHENTICATED ROUTES ==================

    const isAuthenticated: RequestHandler = (req, res, next) => {
        // Check to see if session exists
        if (!requestIsAuthenticated(req)) {
            return res.redirect('/login');
        }

        // Otherwise, proceed as normal
        next();
    };

    app.post('/tweet', isAuthenticated, (req, res) => {
        const tweet = req.body?.tweet;

        if (!tweet) {
            return getSortedTweets().then(tweets => {
                res.render('index', { tweets, error: 'Tweet cannot be empty' });
            });
        }

        // TODO: Handle errors here...somehow
        client.query('INSERT INTO Tweet (username, text) VALUES ($1, $2)', [req.session!.username, tweet]);

        res.redirect('/');
    });

    app.get('/logout', isAuthenticated, (req, res) => {
        res.clearCookie('authToken');
        res.redirect('/');
    });

// ================== UNAUTHENTICATED-ONLY ROUTES ==================

    const isNotAuthenticated: RequestHandler = (req, res, next) => {
        // Check to see if session exists
        if (requestIsAuthenticated(req)) {
            return res.redirect('/');
        }

        // Otherwise, proceed as normal
        next();
    };

    app.get('/register', isNotAuthenticated, (req, res) => {
        res.render('register');
    });

    app.post('/register', isNotAuthenticated, async (req, res) => {
        try {
            // Validate user input
            const { username, password, confirmPassword } = req.body;
            if (!username || username.trim().length === 0 || !password || !confirmPassword) {
                return res.render('register', { errorMessage: 'Please provide a username, password, and confirmation password.' });
            }
            if (password !== confirmPassword) {
                return res.render('register', { errorMessage: 'Passwords do not match.' });
            }

            // Hash the password using argon2
            const hashedPassword = await argon2.hash(password);

            // Store the user in your database
            await client.query('INSERT INTO Account (username, passwordHash) VALUES ($1, $2)', [username, hashedPassword]);

            const token = nanoid();

            await client.query(
                'INSERT INTO AccountSession (token, username, expiry, sessionData) VALUES ($1, $2, $3, $4)',
                [
                    token,
                    username,
                    add(new Date(), { days: 30 }),
                    {}
                ]
            );

            // Set the auth token in a cookie
            res.cookie('authToken', token, { httpOnly: true, maxAge: THIRTY_DAYS });

            res.redirect('/');
        } catch (error) {
            console.error(error);
            res.render('register', { errorMessage: 'An error occurred while processing your request. Please try again later.' });
        }
    });

    app.get('/login', isNotAuthenticated, (req, res) => {
        return res.render('login');
    });

    app.post('/login', isNotAuthenticated, async (req, res) => {
        const { username, password, remember } = req.body;

        const user = await client.query<{ passwordHash: string }>('SELECT passwordHash FROM Account WHERE username = $1', [username])
            .then(result => result.rows[0] ?? null);
        const passwordMatchesHash = user && (await argon2.verify(user.passwordHash, password));

        if (user && passwordMatchesHash) {
            const token = nanoid();

            await client.query(
                'INSERT INTO AccountSession (token, username, expiry, sessionData) VALUES ($1, $2, $3, $4)',
                [
                    token,
                    username,
                    add(new Date(), { days: 30 }),
                    {}
                ]
            );

            // Set the auth token in a cookie
            res.cookie('authToken', token, { httpOnly: true, maxAge: remember ? THIRTY_DAYS : undefined });

            // If the authentication succeeds, redirect the user to the homepage
            return res.redirect('/');
        } else {
            // If the authentication fails, render the login template with an error message
            return res.render('login', { errorMessage: 'Invalid username or password' });
        }
    });

    app.listen(3000, () => {
        console.log('Server is running on port 3000');
    });
})();