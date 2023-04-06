import express from 'express';
const app = express();

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use('/static', express.static('static'));

app.get('/', (req, res) => {
    res.send('Hello, world!');
});

// Run the server on port 3000
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});