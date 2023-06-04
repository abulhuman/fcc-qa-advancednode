'use strict';
require('dotenv').config();
const express = require('express');
const myDB = require('./connection');
const fccTesting = require('./freeCodeCamp/fcctesting.js');

const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const passportSocketIo = require('passport.socketio');
const auth = require('./auth.js');
const routes = require('./routes.js');

const app = express();

const http = require('http').createServer(app);
const io = require('socket.io')(http);

const MongoStore = require('connect-mongo')(session);
const store = new MongoStore({ url: process.env.MONGO_URI });

function onAuthorizeSuccess(data, accept) {
	console.log('successful connection to socket.io');

	accept(null, true);
}

function onAuthorizeFail(data, message, error, accept) {
	if (error) throw new Error(message);
	console.log('failed connection to socket.io:', message);
	accept(null, false);
}

app.use(passport.initialize());
app.use(passport.session());

io.use(
	passportSocketIo.authorize({
		cookieParser: cookieParser,
		key: 'express.sid',
		secret: process.env.SESSION_SECRET,
		store,
		success: onAuthorizeSuccess,
		fail: onAuthorizeFail
	})
);


app.use(session({
	key: 'express.sid',
	secret: process.env.SESSION_SECRET || 'super-secret',
	resave: true,
	saveUninitialized: true,
	store,
	cookie: { secure: false }
}));


fccTesting(app); //For FCC testing purposes
app.use('/public', express.static(process.cwd() + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.set('views', './views/pug');

myDB(async client => {
	const myDataBase = await client.db('database').collection('users');

	routes(app, myDataBase);
	auth(app, myDataBase)

}).catch(e => {
	app.route('/').get((req, res) => {
		res.render('index', { title: e, message: 'Unable to connect to database' });
	});
});

let currentUsers = 0;

io.on('connection', socket => {
	++currentUsers;
	console.log('user ' + socket.request.user.username + ' connected');
    socket.on('chat message', (message) => {
      io.emit('chat message', { username: socket.request.user.username, message });
    });
	io.emit('user', { username: socket.request.user.username, currentUsers, connected: true });
	socket.on('disconnect', () => {
		/*anything you want to do on disconnect*/
		--currentUsers;
		io.emit('user', { username: socket.request.user.username, currentUsers, connected: false });
	});
});


const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
	console.log('Listening on port ' + PORT);
});
