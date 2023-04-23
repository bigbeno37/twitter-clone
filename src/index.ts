import express from 'express';
import { compareDesc, format } from 'date-fns';
import * as argon2 from "argon2";
import {nanoid} from "nanoid";
import cookieParser from "cookie-parser";

const app = express();

// TODO: Remove hardcoded test data and generate these types from Zod schemas
type User = {
    username: string;
    createdAt: Date;
    password: string;
};

const USERS: User[] = [];

type AuthToken = {
    token: string;
    username: string;
};

const AUTH_TOKENS: AuthToken[] = [];

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

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use('/static', express.static('static'));

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const getSortedTweets = () => {
    return TWEETS.sort((a, b) => compareDesc(a.createdAt, b.createdAt));
};

app.use((req, res, next) => {
    // Add formatISO as a local for EJS templates
    res.locals['format'] = format;
    next();
});

app.use((req, res, next) => {
    // Middleware that checks AUTH_TOKENS for a valid token from the authToken cookie in the request
    const authToken = req.cookies?.authToken;

    console.log('auth token', authToken);

    if (authToken) {
        const username = AUTH_TOKENS.find(u => u.token === authToken)?.username;
        console.log('username', username);

        if (username) {
            res.locals['username'] = username;
        }
    }

    next();
});

app.get('/', (req, res) => {
    res.render('index', { tweets: getSortedTweets() });
});

app.post('/tweet', (req, res) => {
    const tweet = req.body?.tweet;

    if (!tweet) {
        return res.render('index', { tweets: getSortedTweets(), error: 'Tweet cannot be empty' });
    }

    TWEETS.push({ id: '5', username: 'user1', createdAt: new Date(), text: tweet });

    res.redirect('/');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
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
        USERS.push({ username, createdAt: new Date(), password: hashedPassword });

        const token = nanoid();

        AUTH_TOKENS.push({ token, username });

        // Set the auth token in a cookie
        res.cookie('authToken', token, { httpOnly: true });

        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.render('register', { errorMessage: 'An error occurred while processing your request. Please try again later.' });
    }
});

// Run the server on port 3000
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});