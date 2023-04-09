import express from 'express';
import { compareDesc, format } from 'date-fns';
const app = express();

// TODO: Remove hardcoded test data and generate these types from Zod schemas
type User = {
    username: string;
    createdAt: Date;
    password: string;
    salt: string;
};

const USERS: User[] = [
    {
        username: 'user1',
        createdAt: new Date(),
        password: 'password1',
        salt: 'salt1',
    }
];

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

const getSortedTweets = () => {
    return TWEETS.sort((a, b) => compareDesc(a.createdAt, b.createdAt));
};

app.use((req, res, next) => {
    // Add formatISO as a local for EJS templates
    res.locals['format'] = format;
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

// Run the server on port 3000
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});