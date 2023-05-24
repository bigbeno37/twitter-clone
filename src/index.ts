import express, {RequestHandler} from 'express';
import {add, compareDesc, format, isPast} from 'date-fns';
import * as argon2 from "argon2";
import {nanoid} from "nanoid";
import cookieParser from "cookie-parser";
import type {Response} from "express";

const app = express();

// TODO: Remove hardcoded test data and generate these types from Zod schemas
type User = {
    username: string;
    createdAt: Date;
    passwordHash: string;
};

const USERS: User[] = [];

type UserSession = {
    token: string;
    username: string;
    expiry: Date;
    sessionData: Record<string, any>;
};

const USER_SESSIONS: UserSession[] = [];

type UserFollow = {
    username: string;
    followingUsername: string;
}

const USER_FOLLOWS: UserFollow[] = [];

type Tweet = {
    id: string;
    username: string;
    createdAt: Date;
    text: string;
};

const tweet = (username: string, text: string): Tweet => {
    return {
        id: '1',
        username,
        createdAt: new Date(),
        text,
    };
}

const TWEETS: Tweet[] = [
    tweet('user1', 'Wow, this is an awesome tweet!'),
    tweet('user1', 'Cool story bro'),
];

type TweetLike = {
    tweetId: string;
    username: string;
}

const TWEET_LIKES: TweetLike[] = [];

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

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/static', express.static('static'));

const getSortedTweets = () => {
    return TWEETS.sort((a, b) => compareDesc(a.createdAt, b.createdAt));
};

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

    const session = USER_SESSIONS.find(u => u.token === authToken);
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
});

app.get('/', (req, res) => {
    res.render('index', { tweets: getSortedTweets() });
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
        return res.render('index', { tweets: getSortedTweets(), error: 'Tweet cannot be empty' });
    }

    TWEETS.push({ id: TWEETS.length+1+'', username: req.session?.username!, createdAt: new Date(), text: tweet });

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
        USERS.push({ username, createdAt: new Date(), passwordHash: hashedPassword });

        const token = nanoid();

        USER_SESSIONS.push({ token, username, expiry: add(new Date(), { days: 30 }), sessionData: {} });

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

    const user = USERS.find(u => u.username === username);
    const passwordMatchesHash = user && (await argon2.verify(user.passwordHash, password));

    if (user && passwordMatchesHash) {
        const token = nanoid();

        USER_SESSIONS.push({ token, username, expiry: add(new Date(), { days: 30 }), sessionData: {} });

        // Set the auth token in a cookie
        res.cookie('authToken', token, { httpOnly: true, maxAge: remember ? THIRTY_DAYS : undefined });

        // If the authentication succeeds, redirect the user to the homepage
        return res.redirect('/');
    } else {
        // If the authentication fails, render the login template with an error message
        return res.render('login', { errorMessage: 'Invalid username or password' });
    }
});

// Run the server on port 3000
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});