const mysql = require('mysql');
const config = require('./config');

const { db: { host, user, password, database } } = config;
const connection = mysql.createConnection({
    host     : host,
    user     : user,
    password : password,
    database : database,
});

setInterval(function () {
    connection.query('SELECT 1');
}, 5000);

module.exports = connection;